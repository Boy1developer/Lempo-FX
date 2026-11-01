"""Manage the editor-to-viewport child process and its JSON-lines protocol."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence


ViewportCallback = Callable[[dict[str, Any]], None]


class ViewportBridge:
    """Own a viewport-host process and send it sequenced JSON messages.

    The host owns the webview. This class owns the child's stdin/stdout pipes;
    its reader thread delivers host events without blocking the Dear PyGui UI.
    """

    _EVENT_TYPES = ("ready", "emitterMoved", "pick", "stats", "error")

    def __init__(
        self,
        command: Sequence[str] | None = None,
        *,
        cwd: str | os.PathLike[str] | None = None,
        popen_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
    ) -> None:
        self.command = list(command) if command is not None else self._default_command()
        self.cwd = Path(cwd) if cwd is not None else Path(__file__).resolve().parents[1]
        self._popen_factory = popen_factory
        self._process: subprocess.Popen[str] | None = None
        self._send_lock = threading.Lock()
        self._callbacks_lock = threading.Lock()
        self._callbacks: dict[str, list[ViewportCallback]] = {
            event: [] for event in (*self._EVENT_TYPES, "exit")
        }
        self._seq = 0
        self._closed = False
        self._reader: threading.Thread | None = None

    @staticmethod
    def _default_command() -> list[str]:
        if getattr(sys, "frozen", False):
            return [sys.executable, "--viewport-host"]
        entry = Path(__file__).with_name("studio_imgui.py")
        return [sys.executable, str(entry), "--viewport-host"]

    @property
    def process(self) -> subprocess.Popen[str] | None:
        """Return the child process, if it has been started."""
        return self._process

    def start(self) -> None:
        """Start the viewport host once; repeated calls are harmless."""
        with self._send_lock:
            if self._closed:
                raise RuntimeError("ViewportBridge has been closed")
            if self._process is not None and self._process.poll() is None:
                return
            self._process = self._popen_factory(
                self.command,
                cwd=str(self.cwd),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=None,
                text=True,
                encoding="utf-8",
                bufsize=1,
            )
            self._reader = threading.Thread(
                target=self._read_messages,
                name="lempo-viewport-reader",
                daemon=True,
            )
            self._reader.start()

    def on(self, event: str, callback: ViewportCallback) -> Callable[[], None]:
        """Subscribe to a host event and return a function that removes it."""
        if event not in self._callbacks:
            raise ValueError(f"Unsupported viewport event: {event}")
        with self._callbacks_lock:
            self._callbacks[event].append(callback)

        def unsubscribe() -> None:
            with self._callbacks_lock:
                try:
                    self._callbacks[event].remove(callback)
                except ValueError:
                    pass

        return unsubscribe

    def on_emitter_moved(self, callback: ViewportCallback) -> Callable[[], None]:
        return self.on("emitterMoved", callback)

    def on_pick(self, callback: ViewportCallback) -> Callable[[], None]:
        return self.on("pick", callback)

    def on_stats(self, callback: ViewportCallback) -> Callable[[], None]:
        return self.on("stats", callback)

    def on_error(self, callback: ViewportCallback) -> Callable[[], None]:
        return self.on("error", callback)

    def on_ready(self, callback: ViewportCallback) -> Callable[[], None]:
        return self.on("ready", callback)

    def on_exit(self, callback: ViewportCallback) -> Callable[[], None]:
        return self.on("exit", callback)

    def send(self, message_type: str, **payload: Any) -> int:
        """Send one JSON-lines message and return its sequence number."""
        with self._send_lock:
            if self._closed:
                raise RuntimeError("ViewportBridge has been closed")
            process = self._process
            if process is None or process.poll() is not None or process.stdin is None:
                raise RuntimeError("Viewport host is not running")
            self._seq += 1
            message = {"type": message_type, "seq": self._seq, **payload}
            try:
                process.stdin.write(json.dumps(message, separators=(",", ":")) + "\n")
                process.stdin.flush()
            except (BrokenPipeError, OSError) as exc:
                raise RuntimeError("Viewport host JSON-lines pipe is closed") from exc
            return self._seq

    def set_effect(self, effect: Mapping[str, Any]) -> int:
        mode = effect.get("type", "2d")
        return self.send("setEffect", mode=mode, effect=dict(effect))

    def patch(self, ops: Sequence[Mapping[str, Any]]) -> int:
        return self.send("patch", ops=[dict(op) for op in ops])

    def transport(self, action: str, t: float | None = None) -> int:
        if action not in {"play", "pause", "restart", "seek"}:
            raise ValueError(f"Unsupported transport action: {action}")
        payload: dict[str, Any] = {"action": action}
        if t is not None:
            payload["t"] = float(t)
        return self.send("transport", **payload)

    def set_tool(self, tool: str) -> int:
        if tool not in {"select", "move", "zone"}:
            raise ValueError(f"Unsupported viewport tool: {tool}")
        return self.send("setTool", tool=tool)

    def set_view(self, **options: bool) -> int:
        allowed = {"grid", "guides", "stats"}
        if options.keys() - allowed:
            raise ValueError(f"Unsupported view options: {sorted(options.keys() - allowed)}")
        return self.send("setView", **options)

    def set_quality(self, quality: str) -> int:
        if quality not in {"low", "medium", "high", "auto"}:
            raise ValueError(f"Unsupported viewport quality: {quality}")
        return self.send("setQuality", quality=quality)

    def shutdown(self, timeout: float = 2.0) -> None:
        """Ask the host to exit, then close pipes and reap it if necessary."""
        with self._send_lock:
            if self._closed:
                return
            self._closed = True
            process = self._process
            if process is None:
                return
            if process.poll() is None and process.stdin is not None:
                self._seq += 1
                try:
                    process.stdin.write(json.dumps({"type": "shutdown", "seq": self._seq}) + "\n")
                    process.stdin.flush()
                    process.stdin.close()
                except (BrokenPipeError, OSError):
                    pass
        if process.poll() is None:
            try:
                process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        reader = self._reader
        if reader is not None and reader is not threading.current_thread():
            reader.join(timeout=timeout)
        if process.stdout is not None:
            process.stdout.close()

    close = shutdown

    def _read_messages(self) -> None:
        process = self._process
        if process is None or process.stdout is None:
            return
        try:
            for line in process.stdout:
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    self._dispatch("error", {"message": "Invalid JSON from viewport host", "line": line.rstrip()})
                    continue
                if not isinstance(message, dict) or not isinstance(message.get("type"), str):
                    self._dispatch("error", {"message": "Invalid message from viewport host"})
                    continue
                self._dispatch(message["type"], message)
        finally:
            self._dispatch("exit", {"returncode": process.poll()})

    def _dispatch(self, event: str, payload: dict[str, Any]) -> None:
        with self._callbacks_lock:
            callbacks = tuple(self._callbacks.get(event, ()))
        for callback in callbacks:
            try:
                callback(payload)
            except Exception:
                # A UI callback must not terminate the pipe reader thread.
                continue

    def __enter__(self) -> "ViewportBridge":
        self.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.shutdown()
