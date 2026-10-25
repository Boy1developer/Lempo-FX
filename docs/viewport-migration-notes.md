# Viewport migration notes

## Spike A — Dear PyGui + pywebview process bridge

- **Result:** Passed. Dear PyGui ran in the parent while a separate pywebview
  process owned a native webview window; newline-delimited JSON echo messages
  made a full parent → child → parent round trip.
- **Measurement:** 100 steady-state samples after 5 warm-ups; median **0.259 ms**
  and p95 **31.046 ms**. The median meets the plan's `< 5 ms` target. The p95
  outlier shows that occasional scheduling/UI stalls remain; this spike only
  measures the local pipe and JSON handling, not JS evaluation or rendering.
- **Environment:** Windows, Python 3.14.3, Dear PyGui 2.3.1, pywebview 6.2.1.
  `pywebview` was installed in the user Python environment for this run; it is
  not yet declared as an application dependency.
- **Reproduce:** `python tools/spike_viewport_bridge.py --samples 100`
- **Implementation:** `tools/spike_viewport_bridge.py` starts the host with
  `--viewport-host`; the parent owns and terminates the child process.

## Spike B — frozen `--viewport-host` launch

- **Result:** Passed. Built the PyInstaller one-file executable in a temporary
  directory and launched it with `--viewport-host`. The native window rendered
  its page, and the host wrote `loaded:edgechromium` to the smoke status file.
  This confirms the same executable can dispatch to a separate pywebview host.
- **Packaging:** PyInstaller 6.22.3's pywebview hook included the backend
  dependencies; `viewport_host` and `webview` are now explicit hidden imports.
  The production `dist/` executable and shortcut were not overwritten.
- **Windows requirement:** This host forces pywebview's `edgechromium`
  renderer, which requires the Microsoft Edge WebView2 Runtime; pywebview also
  lists .NET Framework 4.6.2 or newer for Windows. See the [pywebview engine
  requirements](https://pywebview.flowrl.com/guide/web_engine) and
  [installation guide](https://pywebview.flowrl.com/guide/installation).
- **Fallback if WebView2 is unavailable:** report that the embedded viewport
  could not start and open the self-contained `preview/live_effect.html` in the
  system default browser. The page is bundled and makes no network fetches.
  The fallback launcher itself remains to be implemented with the viewport
  bridge in Phase 3.
- **Implementation:** `editor/viewport_host.py` is the host entry; the
  `studio_imgui.py` entry point dispatches `--viewport-host` before starting
  Dear PyGui.

