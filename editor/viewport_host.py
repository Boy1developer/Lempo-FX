"""Minimal pywebview host entry used to validate the frozen child-process path."""
from __future__ import annotations

import sys
from pathlib import Path


def run_viewport_host() -> int:
    try:
        import webview
    except ImportError as exc:
        if sys.stderr is not None:
            print(f"pywebview unavailable: {exc}", file=sys.stderr)
        return 2

    status_file = None
    args = iter(sys.argv[1:])
    for arg in args:
        if arg == "--spike-status-file":
            status_file = Path(next(args))
    if status_file:
        status_file.write_text("starting:edgechromium\n", encoding="utf-8")

    window = webview.create_window(
        "Lempo viewport host — Spike B",
        html="""<!doctype html><meta charset='utf-8'><title>Spike B</title>
        <body style='font:16px system-ui;background:#1a1b22;color:#eee;padding:2em'>
        <h2>Frozen pywebview child</h2>
        <p>Launched by the Lempo executable with <code>--viewport-host</code>.</p>
        </body>""",
        width=560,
        height=300,
    )

    if status_file:
        def mark_loaded() -> None:
            status_file.write_text("loaded:edgechromium\n", encoding="utf-8")
        window.events.loaded += mark_loaded
    try:
        # Force the Chromium renderer for the spike so it explicitly exercises
        # the WebView2 runtime requirement instead of silently using MSHTML.
        webview.start(gui="edgechromium", debug=False, http_server=False)
    except Exception as exc:
        if status_file:
            status_file.write_text(f"error:{type(exc).__name__}: {exc}\n", encoding="utf-8")
        if sys.stderr is not None:
            print(f"pywebview EdgeChromium startup failed: {exc}", file=sys.stderr)
        return 3
    return 0

