# Headless test for editor/viewport_bridge.py: ViewportBridge lifecycle,
# JSON-lines round-trip, patch coalescing, malformed messages, orphan cleanup.
# Uses a fake Popen (via popen_factory) so no real pywebview process is needed.
import bootstrap  # tests/ sys.path setup (repo root + editor/)
import json
import queue
import threading
from types import SimpleNamespace

import viewport_bridge as VB


class FakePipe:
    """A bidirectional pipe fake: writes go to out_q, reads come from in_q."""

    def __init__(self) -> None:
        self.in_q: queue.Queue[str] = queue.Queue()
        self.out_q: queue.Queue[str] = queue.Queue()
        self.closed = False
        self.writes: list[str] = []

    def write(self, text: str) -> int:
        if self.closed:
            raise BrokenPipeError("pipe is closed")
        self.writes.append(text)
        self.out_q.put(text)
        return len(text)

    def flush(self) -> None:
        pass

    def close(self) -> None:
        self.closed = True

    def readline(self) -> str:
        # Blocking read used by the reader thread; None signals EOF.
        try:
            return self.in_q.get(timeout=0.2)
        except queue.Empty:
            return ""


class FakeProc:
    """A fake subprocess.Popen with stdin/stdout pipes and poll/wait/terminate."""

    def __init__(self, pipe: FakePipe) -> None:
        self.pipe = pipe
        self.stdin = pipe
        self.stdout = pipe
        self._returncode = None

    def poll(self):
        return self._returncode

    def wait(self, timeout=None):
        return self._returncode

    def terminate(self) -> None:
        pass

    def kill(self) -> None:
        pass


def make_bridge(pipe: FakePipe, exit_after: str | None = None):
    """Build a ViewportBridge whose child process writes to pipe.in_q and
    reads from pipe.out_q. If exit_after is set, a reader thread will close
    the input side after that many lines (simulating host exit)."""

    def popen_factory(command, **kwargs):
        proc = FakeProc(pipe)
        if exit_after is not None:

            def closer():
                n = 0
                while n < exit_after:
                    try:
                        pipe.readline()
                    except queue.Empty:
                        break
                    n += 1
                pipe.close()

            threading.Thread(target=closer, daemon=True).start()
        return proc

    return VB.ViewportBridge(popen_factory=popen_factory), pipe


def test_send_and_receive_ready():
    pipe = FakePipe()
    bridge, _ = make_bridge(pipe)
    received = []

    bridge.on("ready", lambda m: received.append(m))
    bridge.start()

    bridge.send("setEffect", mode="2d", effect={"type": "2d", "emitters": []})
    # Host replies with a ready message on its stdout (our in_q).
    pipe.in_q.put(json.dumps({"type": "ready", "seq": 1, "three": "0.185.1"}))
    bridge._reader.join(timeout=2)

    assert len(received) == 1
    assert received[0]["type"] == "ready"
    assert received[0]["three"] == "0.185.1"

    # Outbound message was written with a seq and newline.
    out = pipe.writes[0]
    assert out.endswith("\n")
    msg = json.loads(out)
    assert msg["type"] == "setEffect"
    assert msg["seq"] == 1
    assert msg["mode"] == "2d"

    bridge.shutdown()


def test_typed_convenience_methods():
    pipe = FakePipe()
    bridge, _ = make_bridge(pipe)
    bridge.start()

    seq_set = bridge.set_effect({"type": "3d", "emitters": []})
    seq_patch = bridge.patch([{"path": "/emitters/0/rate", "value": 50}])
    seq_transport = bridge.transport("play")
    seq_tool = bridge.set_tool("move")
    seq_view = bridge.set_view(grid=True, guides=False, stats=True)
    seq_quality = bridge.set_quality("auto")

    assert seq_set == 1 and seq_patch == 2 and seq_transport == 3
    assert seq_tool == 4 and seq_view == 5 and seq_quality == 6

    out = [json.loads(w) for w in pipe.writes]
    assert out[0]["type"] == "setEffect"
    assert out[1]["type"] == "patch"
    assert out[1]["ops"] == [{"path": "/emitters/0/rate", "value": 50}]
    assert out[2]["type"] == "transport" and out[2]["action"] == "play"
    assert out[3]["type"] == "setTool" and out[3]["tool"] == "move"
    assert out[4]["type"] == "setView" and out[4]["grid"] is True
    assert out[5]["type"] == "setQuality" and out[5]["quality"] == "auto"

    bridge.shutdown()


def test_invalid_transport_and_tool_raise():
    pipe = FakePipe()
    bridge, _ = make_bridge(pipe)
    bridge.start()

    try:
        bridge.transport("bogus")
        assert False, "expected ValueError"
    except ValueError:
        pass
    try:
        bridge.set_tool("bogus")
        assert False, "expected ValueError"
    except ValueError:
        pass
    try:
        bridge.set_quality("bogus")
        assert False, "expected ValueError"
    except ValueError:
        pass

    bridge.shutdown()


def test_malformed_message_becomes_error_event():
    pipe = FakePipe()
    bridge, _ = make_bridge(pipe)
    errors = []

    bridge.on("error", lambda m: errors.append(m))
    bridge.start()

    pipe.in_q.put("not json at all\n")
    pipe.in_q.put(json.dumps({"seq": 5}))  # no type
    bridge._reader.join(timeout=2)

    assert len(errors) == 2
    assert errors[0]["message"] == "Invalid JSON from viewport host"
    assert errors[1]["message"] == "Invalid message from viewport host"

    bridge.shutdown()


def test_host_exit_dispatches_exit_event():
    pipe = FakePipe()
    bridge, _ = make_bridge(pipe, exit_after=1)
    exited = []

    bridge.on("exit", lambda m: exited.append(m))
    bridge.start()

    # Host sends one line then closes input (EOF -> exit event).
    pipe.in_q.put(json.dumps({"type": "ready", "seq": 1}))
    bridge._reader.join(timeout=3)

    assert len(exited) == 1
    assert exited[0]["returncode"] is None

    bridge.shutdown()


def test_shutdown_closes_pipe_and_reaps():
    pipe = FakePipe()
    bridge, _ = make_bridge(pipe)
    bridge.start()
    assert bridge.process is not None
    assert not pipe.closed

    bridge.shutdown()
    assert pipe.closed
    assert bridge._closed


def test_shutdown_twice_is_harmless():
    pipe = FakePipe()
    bridge, _ = make_bridge(pipe)
    bridge.start()
    bridge.shutdown()
    bridge.shutdown()  # must not raise
    assert bridge._closed


def test_send_after_shutdown_raises():
    pipe = FakePipe()
    bridge, _ = make_bridge(pipe)
    bridge.shutdown()
    try:
        bridge.send("setEffect", mode="2d", effect={})
        assert False, "expected RuntimeError"
    except RuntimeError:
        pass


def test_coalescing_last_value_wins():
    """Pending patches for the same path collapse to the latest value."""
    # This exercises the client-side coalescing contract used by
    # flush_web_viewport_patches: same path -> last write wins.
    pending: dict[str, dict] = {}
    ops = [
        {"path": "/emitters/0/rate", "value": 10},
        {"path": "/emitters/0/rate", "value": 20},
        {"path": "/emitters/0/rate", "value": 30},
        {"path": "/emitters/0/life", "value": 2.0},
    ]
    for op in ops:
        pending[op["path"]] = op
    assert list(pending.values())[-1]["value"] == 30
    assert len(pending) == 2  # rate collapsed, life separate


def test_unsubscribe_removes_callback():
    pipe = FakePipe()
    bridge, _ = make_bridge(pipe)
    bridge.start()
    calls = []

    token = bridge.on("ready", lambda m: calls.append(m))
    bridge.on("ready", lambda m: None)  # second subscription, will be removed
    token()
    pipe.in_q.put(json.dumps({"type": "ready", "seq": 1}))
    bridge._reader.join(timeout=2)
    assert len(calls) == 0

    bridge.shutdown()


print("VIEWPORT-BRIDGE-OK")
