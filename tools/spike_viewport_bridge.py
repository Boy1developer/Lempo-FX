"""Spike A: run Dear PyGui beside a pywebview child and measure JSONL RTT.

Run from the repository root with ``python tools/spike_viewport_bridge.py``.
Close either window to end the spike. The parent owns the child process and
prints median/p95 round-trip latency when the DPG window closes.
"""
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = Path(__file__).resolve()


def _host() -> int:
    """Child process: keep a real pywebview window open and echo JSONL."""
    try:
        import webview
    except ImportError:
        print("pywebview is required: python -m pip install pywebview", file=sys.stderr)
        return 2

    html = """<!doctype html><meta charset='utf-8'>
      <title>Lempo viewport bridge spike</title>
      <body style='font:16px system-ui;background:#1a1b22;color:#eee;padding:2em'>
      <h2>Spike A — pywebview child</h2>
      <p>This native webview is running beside the Dear PyGui editor window.</p>
      <p>JSON-lines echo is active on this process's stdin/stdout.</p></body>"""
    webview.create_window("Lempo viewport bridge — Spike A", html=html,
                          width=520, height=260)
    output_lock = threading.Lock()

    def echo_jsonl() -> None:
        for line in sys.stdin:
            try:
                message = json.loads(line)
                response = {"type": message.get("type"), "seq": message.get("seq"),
                            "echo": message}
                with output_lock:
                    sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
                    sys.stdout.flush()
            except (json.JSONDecodeError, AttributeError) as exc:
                with output_lock:
                    sys.stdout.write(json.dumps({"type": "error", "error": str(exc)}) + "\n")
                    sys.stdout.flush()

    threading.Thread(target=echo_jsonl, name="jsonl-echo", daemon=True).start()
    # Protocol output is stdout only. Keep all pywebview diagnostics on stderr.
    webview.start(debug=False, http_server=False)
    return 0


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))]


def _parent(samples: int) -> int:
    try:
        import dearpygui.dearpygui as dpg
    except ImportError:
        print("Dear PyGui is required: python -m pip install dearpygui", file=sys.stderr)
        return 2

    child = subprocess.Popen(
        [sys.executable, str(SCRIPT), "--viewport-host"], cwd=ROOT,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=None,
        text=True, encoding="utf-8", bufsize=1,
    )
    measurements: list[float] = []
    seq = 0
    failed = None
    try:
        # Wait briefly for the child webview to initialize before measuring.
        time.sleep(1.0)
        if child.poll() is not None:
            print(f"Viewport host exited during startup (code {child.returncode}).")
            return child.returncode or 1

        dpg.create_context()
        with dpg.window(label="Spike A — Dear PyGui", width=480, height=220):
            dpg.add_text("Dear PyGui parent + pywebview child are running.")
            dpg.add_text("Sending JSON-lines echo requests; close this window to finish.")
            dpg.add_text("Waiting for samples…", tag="spike_status")
        dpg.create_viewport(title="Lempo bridge spike", width=520, height=300)
        dpg.setup_dearpygui()
        dpg.show_viewport()

        while dpg.is_dearpygui_running() and len(measurements) < samples:
            seq += 1
            request = {"type": "spike_echo", "seq": seq,
                       "sent_ns": time.perf_counter_ns()}
            started = time.perf_counter_ns()
            child.stdin.write(json.dumps(request, separators=(",", ":")) + "\n")
            child.stdin.flush()
            line = child.stdout.readline()
            elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
            if not line:
                failed = f"Viewport host closed its JSONL stream (code {child.poll()})."
                break
            response = json.loads(line)
            if response.get("seq") != seq or response.get("type") != "spike_echo":
                failed = f"Unexpected child response: {response!r}"
                break
            # First five are warm-up; report only steady-state round trips.
            if seq > 5:
                measurements.append(elapsed_ms)
            dpg.set_value("spike_status",
                          f"Measured {len(measurements)}/{samples} — latest RTT {elapsed_ms:.3f} ms")
            dpg.render_dearpygui_frame()
            if child.poll() is not None:
                failed = f"Viewport host exited (code {child.returncode})."
                break

        dpg.destroy_context()
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        if child.stdin:
            child.stdin.close()
        if child.stdout:
            child.stdout.close()

    if failed:
        print(f"Spike failed: {failed}")
        return 1
    if measurements:
        median = statistics.median(measurements)
        p95 = _percentile(measurements, 0.95)
        print(f"JSONL round-trip: n={len(measurements)}, median={median:.3f} ms, p95={p95:.3f} ms")
        print(f"Target (< 5 ms median): {'PASS' if median < 5 else 'FAIL'}")
        return 0 if median < 5 else 1
    print("No samples collected; close the DPG window after the two windows appear.")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--viewport-host", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--samples", type=int, default=100,
                        help="steady-state round trips to measure (default: 100)")
    args = parser.parse_args()
    if args.viewport_host:
        return _host()
    if args.samples < 1:
        parser.error("--samples must be positive")
    return _parent(args.samples)


if __name__ == "__main__":
    raise SystemExit(main())
