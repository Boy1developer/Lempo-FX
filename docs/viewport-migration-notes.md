# Viewport migration notes

## Phase 0 recon — current viewport and runtime comparison

### 1. Dear PyGui viewport inventory

- **Viewport widget and handler registration:** `editor/studio_imgui.py:3324-3328`
  creates `vp_child` / `vp_draw`; `:3475-3505` builds the application and
  registers wheel, left double-click, left drag, keyboard, and numpad handlers.
- **Particle and mesh drawing helpers:** `:860-1215` contains shape, custom
  image/model, and mesh drawing helpers used by the viewport.
- **2D drawlist path:** `:1217-1645` draws the background/grid, zone and cone
  guides, particle dots, trails, vignette, and emitter gizmo.
- **3D drawlist path:** `:1646-1920` draws the 3D grid, guides, particle dots,
  trails, vignette, and 3-axis emitter gizmo.
- **Per-frame renderer selection and overlays:** `:4439-4705` advances the
  simulation, routes input, clears `vp_draw`, optionally calls
  `raster_view.frame_2d/frame_3d` + `ensure_texture/update_texture` and draws
  the resulting image, or falls back to `draw_view_2d/draw_view_3d`; vector
  guides, trails, gizmo, FPS, and help text are then layered over it.
- **Mouse and navigation input:** the handlers registered above call
  `_trail_wheel_route` (curve editor or viewport wheel), `handle_nav_keys`
  (`:4136`), `handle_splitter` (`:4253`), and `handle_mouse` (`:4290`). They
  implement cursor-anchored 2D zoom, 3D dolly, right-drag 3D orbit,
  middle/space+left pan, gizmo drag, emitter reset on double-click, and panel
  splitter drag. `frame()` gates these using `vp_draw` hover/rect checks and
  sidebar geometry. Keyboard handling also covers tool, view, focus, undo/redo,
  chooser, and editor commands.
- **Writes to `preview/last_effect.json`:** `open_fast_preview()` writes an
  initial export before starting the local preview server (`:4002-4015`);
  the live-push block in `frame()` rewrites it at most every 0.5 s when live
  push is enabled (`:4695-4708`). The model blobs are included when changed.

### 2. Preview engine vs GDevelop runtime

**Repository discrepancy:** the plan names `carrots-runtime/`; the current
repository has `lempo-runtime/`. That package is a typed parser/normalizer, not
a particle simulator. The game simulation lives in the generated JavaScript
inside `AdvancedParticleEmitter.json`. Therefore this comparison uses that
runtime implementation as the game-side reference and records the limitation
of `lempo-runtime` explicitly.

| Behavior | `preview/preview.ts` and scene adapters | Game runtime / `lempo-runtime` |
|---|---|---|
| State sampling and morph | Preview interpolates size, color, opacity, and speed using each segment's easing. Shape selection flips at raw `t >= 0.5`; Three scene also cross-fades shapes/models inside raw `(0.25, 0.75)`. | Extension samples state tracks and switches the discrete shape at the segment midpoint; it does not perform the preview's geometry cross-fade. `lempo-runtime` parses/normalizes states but does not simulate them. |
| Zone and cone | Preview owns separate 2D/3D spawn samplers. It handles circle/sphere, rectangle/box, and line zones, surface/edge modes, rotation, reverse, and directional cones. Its 3D cone uses a tangent/radial sampler. | Extension has independent 2D/3D samplers and maps Three world units back to game units (including the 5.6.284 world-scale change). Its 3D cone uses uniform solid-angle sampling around +X before rotating to the configured direction. Both support the same broad feature set; random sequence and 3D cone distribution are not record-identical. `lempo-runtime` normalizes zone/cone fields only. |
| Force fields | `normFields()` / `fieldAccel()` implement turbulence, Y-axis vortex, linear-falloff attractor, and collision plane in the preview. | Extension embeds its own field helpers and uses the same formulas; `preview/test_fields.mjs` checks helper parity. The typed runtime package does not model or retain the `fields` block. |
| Seed | Preview uses Mulberry32 for nonzero `seed`; zero falls back to `Math.random()`. | Extension uses the same Mulberry32 sequence and reseeds on effect/seed/reset changes; zero also uses `Math.random()`. Spawn algorithms consume random values differently, so matching RNG does not guarantee matching particle records. `lempo-runtime` currently drops `seed`. |
| Trails | Preview imports `preview/trails.ts`, builds its own `TrailStore` and LUTs, and exposes histories to the 2D/3D scene adapters. | Extension embeds separate trail helpers and rendering code in its 2D and 3D event functions. Existing parity tests cover trail math, but there is no shared engine module. `lempo-runtime` has no trail fields. |
| Blend modes | Browser preview uses the editor package versions (`pixi.js` and `three` in root `package.json`). Pixi maps Subtractive to `erase`, Screen/Overlay to Pixi modes, Lighten to Normal; Three implements custom Screen and Lighten, while unsupported Overlay falls back to Normal. | Extension maps modes against GDevelop's bundled renderer constants; missing Pixi/Three constants and unsupported Overlay fall back to Normal with one warning. GDevelop currently uses different Pixi/Three versions than the browser preview. `lempo-runtime` only preserves the blending-mode string. |
| Additional runtime behavior | Preview engine is a reduced simulator: it does not consume all exported runtime tracks/features (for example flow interval/mode, alignment/rotation, and orbit tracks are not part of its `EmitterCfg`/`Keyframe`). | The extension has its own richer per-particle state and track sampling. `lempo-runtime` validation/normalization also omits runtime fields such as seed, fields, trails, flow interval, and orbit/rotation data; it is not yet a lossless runtime contract. |

**Conclusion:** do not import `lempo-runtime` as if it were the game particle
engine. Phase 1 needs a renderer-agnostic simulation module and explicit
parity work against both the browser preview and the extension. The existing
typed loader needs a contract decision for runtime-only fields before it can
serve as that source of truth.

### 3. GDevelop renderer versions

- The extension declares GDevelop 5.6.284 as its minimum supported release.
- GDevelop `v5.6.284` release notes state that the Three.js runtime was
  upgraded to **0.185.1**. Its `GDJS/package.json` pins `@types/three` to
  **0.185.1** and `pixi.js` to **7.4.2**. Sources:
  [GDevelop v5.6.284 GDJS/package.json](https://github.com/4ian/GDevelop/blob/v5.6.284/GDJS/package.json),
  [GDevelop v5.6.284 release](https://github.com/4ian/GDevelop/releases/tag/v5.6.284).
- The editor's browser preview is separate: root `package.json` now pins
  `three 0.185.1` to align with the minimum supported GDevelop runtime, while
  `pixi.js ^8.21.0` remains on a different major than GDevelop's Pixi 7.4.2.
  Pixi version matching remains a later compatibility decision.

### 4. Three.js alignment and regression checks

- Pinned both `three` and `@types/three` in the root package to **0.185.1**;
  refreshed `package-lock.json` and completed `npm ci` successfully.
- All existing preview/runtime Node tests passed on Three.js 0.185.1,
  including engine 2D/3D, guides, models, morph, baking, blend, seed, fields,
  extension runtime/world-scale/trails, and preview trails.
- `lempo-runtime` TypeScript no-emit check passed. The preview TypeScript
  check with the installed TypeScript 7.0.2 did not finish during the run and
  was interrupted; therefore that check is recorded as unresolved rather than
  passing. The browser preview regression tests themselves all passed.
- No renderer code or generated preview bundle was changed as part of the
  dependency alignment.

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

