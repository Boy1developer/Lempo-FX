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

