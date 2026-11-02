"""pywebview host for the bundled editor viewport and its JSON-lines bridge."""
from __future__ import annotations

import json
import queue
import sys
import threading
from pathlib import Path
from typing import Any, Callable, Mapping


def _app_root() -> Path:
    """Resolve bundled data from PyInstaller or the source checkout."""
    bundle_dir = getattr(sys, "_MEIPASS", None)
    if bundle_dir and Path(bundle_dir).is_dir():
        return Path(bundle_dir)
    return Path(__file__).resolve().parents[1]


class _HostAPI:
    """Small JS API exposed to the webview page."""

    def __init__(self, write_message: Callable[[Mapping[str, Any]], None]) -> None:
        self._write_message = write_message
        self._request_close: Callable[[], None] | None = None

    def send_message(self, message: Any) -> bool:
        """Write one viewport event from JavaScript to the editor's stdout pipe."""
        if not isinstance(message, dict):
            self._write_message({"type": "error", "message": "Expected a JSON object from viewport"})
            return False
        if not isinstance(message.get("type"), str) or not isinstance(message.get("seq"), int):
            self._write_message({"type": "error", "message": "Viewport messages require string type and integer seq"})
            return False
        self._write_message(message)
        return True

    def close(self) -> None:
        """Allow the page to request an orderly host shutdown."""
        if self._request_close is not None:
            self._request_close()


def run_viewport_host() -> int:
    try:
        import webview
    except ImportError as exc:
        if sys.stderr is not None:
            print(f"pywebview unavailable: {exc}", file=sys.stderr)
        return 2

    status_file: Path | None = None
    args = iter(sys.argv[1:])
    for arg in args:
        if arg == "--spike-status-file":
            try:
                status_file = Path(next(args))
            except StopIteration:
                if sys.stderr is not None:
                    print("--spike-status-file requires a path", file=sys.stderr)
                return 2
    if status_file:
        status_file.write_text("starting:edgechromium\n", encoding="utf-8")

    page = _app_root() / "preview" / "live_effect.html"
    if not page.is_file():
        if sys.stderr is not None:
            print(f"Bundled viewport page not found: {page}", file=sys.stderr)
        return 2

    inbound: queue.Queue[dict[str, Any]] = queue.Queue()
    stop = threading.Event()
    page_loaded = threading.Event()
    window_shown = threading.Event()
    window_closed = threading.Event()
    destroy_lock = threading.Lock()
    destroy_requested = False
    stdout_lock = threading.Lock()
    host_seq = 0

    def write_message(message: Mapping[str, Any]) -> None:
        nonlocal host_seq
        clean = dict(message)
        if not isinstance(clean.get("type"), str):
            clean["type"] = "error"
            clean["message"] = "Host messages require a string type"
        if not isinstance(clean.get("seq"), int):
            host_seq += 1
            clean["seq"] = host_seq
        try:
            line = json.dumps(clean, ensure_ascii=False, separators=(",", ":"))
            with stdout_lock:
                if sys.stdout is not None:
                    sys.stdout.write(line + "\n")
                    sys.stdout.flush()
        except (OSError, TypeError, ValueError) as exc:
            if sys.stderr is not None:
                print(f"Could not write viewport message: {exc}", file=sys.stderr)

    api = _HostAPI(write_message)
    window = webview.create_window(
        "Lempo Particle Editor — Viewport",
        url=page.resolve().as_uri(),
        js_api=api,
        width=1100,
        height=760,
        min_size=(640, 480),
    )

    def destroy_window() -> None:
        nonlocal destroy_requested
        if not window_shown.is_set() or window_closed.is_set():
            return
        with destroy_lock:
            if destroy_requested or window_closed.is_set():
                return
            destroy_requested = True
        try:
            window.destroy()
        except Exception as exc:
            if sys.stderr is not None:
                print(f"Could not close viewport window: {exc}", file=sys.stderr)

    def request_close() -> None:
        stop.set()
        # The shutdown request can arrive before the native event loop starts.
        # on_shown() completes the close once pywebview is ready.
        destroy_window()

    api._request_close = request_close

    def on_loaded(*_args: Any) -> None:
        # Establish a stable event surface for the viewport bundle. Future
        # browser code can listen for lempo-viewport-message and call
        # window.pywebview.api.send_message(message) for events back to Python.
        bridge_init = """(() => {
          const pending = [];
          window.__lempoViewportMessages = pending;
          window.__lempoViewportReceive = (message) => {
            pending.push(message);
            window.dispatchEvent(new CustomEvent('lempo-viewport-message', { detail: message }));
          };
        })();"""
        try:
            window.evaluate_js(bridge_init)
        except Exception as exc:
            write_message({"type": "error", "message": f"Could not initialize viewport bridge: {exc}"})
        page_loaded.set()
        if status_file:
            status_file.write_text("loaded:edgechromium\n", encoding="utf-8")
        try:
            capabilities = window.evaluate_js(
                "({webgl2: !!document.createElement('canvas').getContext('webgl2')})"
            ) or {}
        except Exception:
            capabilities = {"webgl2": False}
        write_message({
            "type": "ready",
            "three": "0.185.1",
            "pixi": "8.21.0",
            "webgl2": bool(capabilities.get("webgl2", False)),
            "renderer": "edgechromium",
        })

    def on_shown(*_args: Any) -> None:
        window_shown.set()
        if stop.is_set():
            destroy_window()

    def on_closed(*_args: Any) -> None:
        window_closed.set()
        stop.set()

    window.events.loaded += on_loaded
    window.events.shown += on_shown
    window.events.closed += on_closed

    def read_stdin() -> None:
        try:
            for line in sys.stdin:
                try:
                    message = json.loads(line)
                except json.JSONDecodeError as exc:
                    write_message({"type": "error", "message": f"Invalid JSON from editor: {exc}"})
                    continue
                if not isinstance(message, dict) or not isinstance(message.get("type"), str):
                    write_message({"type": "error", "message": "Editor messages require a JSON object and string type"})
                    continue
                if message["type"] == "shutdown":
                    request_close()
                    break
                inbound.put(message)
        finally:
            # EOF means the parent editor has exited; do not leave an orphaned
            # pywebview process behind.
            request_close()

    def relay_to_page() -> None:
        while not stop.is_set():
            try:
                message = inbound.get(timeout=0.1)
            except queue.Empty:
                continue
            if not page_loaded.wait(timeout=10):
                write_message({"type": "error", "message": "Viewport page did not finish loading"})
                continue
            if stop.is_set():
                return
            encoded = json.dumps(message, ensure_ascii=False, separators=(",", ":"))
            script = "window.__lempoViewportReceive(" + encoded + ");"
            try:
                window.evaluate_js(script)
            except Exception as exc:
                write_message({"type": "error", "message": f"Could not relay editor message: {exc}"})

    threading.Thread(target=read_stdin, name="lempo-viewport-stdin", daemon=True).start()
    threading.Thread(target=relay_to_page, name="lempo-viewport-relay", daemon=True).start()

    try:
        # Keep the frozen-host spike's explicit WebView2 requirement visible.
        webview.start(gui="edgechromium", debug=False, http_server=False)
    except Exception as exc:
        stop.set()
        if status_file:
            status_file.write_text(f"error:{type(exc).__name__}: {exc}\n", encoding="utf-8")
        if sys.stderr is not None:
            print(f"pywebview EdgeChromium startup failed: {exc}", file=sys.stderr)
        return 3
    finally:
        stop.set()
    return 0
