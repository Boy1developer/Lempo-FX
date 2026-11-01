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

**Conclusion before Phase 1:** `lempo-runtime` was only a typed loader, not the
game particle engine. Phase 1 now adds a renderer-agnostic simulation module
there and makes the browser preview re-export it. The GDevelop extension still
has a separate simulation implementation; explicit parity and contract work
against that implementation remains outstanding.

## Phase 1 — tasks 1–2: shared engine extraction

- Added `lempo-runtime/src/engine.ts` as the TypeScript source for preview
  simulation (particle pool, seeded PRNG, emission, fields, morph/state sampling,
  and particle/trail state). It has no Three.js, PixiJS, or Canvas dependency.
- Moved pure trail configuration, sampling, LUT, and history logic to
  `lempo-runtime/src/trails.ts`; `lempo-runtime/src/index.ts` exports both
  modules as part of the shared runtime API.
- Replaced the duplicate implementations in `preview/preview.ts` and
  `preview/trails.ts` with compatibility re-exports. Canvas fallback drawing
  now lives in `preview/canvas_renderer.ts`; Three.js and PixiJS adapters keep
  using the same `ParticleEngine` API.
- Added a frame-by-frame seeded regression fixture captured from the pre-move
  implementation. The new engine matches every particle/sample/trail snapshot
  over 120 frames for both 2D fields and 3D trails/fields scenarios.
- Added `ParticleEngine.writeFrame()`, a stable reusable set of typed arrays
  for interleaved positions, ages, sampled size/color/alpha, and shape indices.
  Three.js, PixiJS, and Canvas read the frame arrays directly; scene adapters
  no longer allocate a particle-state and appearance object for every dot.
- Added a frame-by-frame seeded regression fixture captured from the pre-move
  implementation. The new engine matches every particle/sample/trail snapshot
  over 120 frames for both 2D fields and 3D trails/fields scenarios.
- Verification: preview bundle build, all 14 existing preview/runtime Node
  tests, and the new frame-buffer/parity tests passed; both 120-frame seeded
  parity cases passed; TypeScript checks
  passed for `preview/` and `lempo-runtime/`. Set `skipLibCheck` in the preview
  config so TypeScript checks the project while skipping slow dependency `.d.ts`
  validation; the strict project source check completes successfully.
- Added `preview/test_frame_buffers.mjs` for 2D/3D array contents and buffer
  reuse. Re-running `tools/patch_trails_ext.py` returned `ALREADY-PATCHED`; the
  SHA-256 of `AdvancedParticleEmitter.json` remained
  `4C6E00EB63D61DC2DBC9B811B46BBF2A5650CF9F7E003073808D29E6AA69F30D` before
  and after, confirming the migration did not alter the extension artifact.
- Full Phase 1 verification passed: all plan-listed Python core/UI/trails/GL
  suites and preview server, plus the Windows PyInstaller build and 9-second
  smoke boot. Two pre-existing v1.1 test fixtures/assertions were updated to
  current export version 1.2; `tests/test_view2d_zoom.py` passed on rerun after
  one stochastic spawn assertion failed on its first sample.

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

## Phase 2 — steps 1–2: viewport contract and shared frame loop

- Added `preview/viewport/Viewport.ts` with the shared mode/tool/tier, stats,
  patch operation, event payload, and viewport lifecycle contract.
- Added `ViewportController`, `QualityManager`, `StatsHUD`, and `Transport`
  modules. Transport implementations cover the pywebview host's JSON-lines
  adapter, a local/debug WebSocket, and HTTP polling.
- The controller owns the browser fast preview's `requestAnimationFrame`
  scheduler. It pauses while the document is hidden, resumes with a fresh time
  origin, supports dirty-frame invalidation, and uses a capped fixed-step
  accumulator when driving a mounted `Viewport` implementation.
- Connected the current fast-preview callback to the controller. Pixi's
  built-in ticker is disabled and `PixiScene.render()` is called from that same
  frame callback, avoiding an independent Pixi render loop.
- **Still outstanding in Phase 2:** concrete `ThreeViewport` and `PixiViewport`
  classes implementing the contract, applying quality profiles to renderers,
  and contract/switching/resource-lifecycle tests. The production Dear PyGui
  viewport is not connected to this controller; the fast preview remains a
  separate browser page.

## Phase 2 — step 3 and first 3D renderer task

- The existing build path satisfies the self-contained bundle task: `tools/build_preview.py`
  runs the preview TypeScript check and bundles `preview/main.ts` and its imported
  dependencies into `preview/live_bundle.js`. `studio_imgui.open_fast_preview()`
  embeds that bundle and the boot effect directly into `live_effect.html`; no
  network imports are needed by the bundled renderer code.
- Added `preview/viewport/three/ThreeViewport.ts` as the first Three.js viewport
  foundation. It creates a low-tier-configured `WebGLRenderer`, a perspective
  camera and `OrbitControls` with damping disabled; it also handles resize,
  camera-change invalidation and disposal. It does not yet implement particle
  simulation/rendering or the full `Viewport` contract.
- The preview build passed after this addition. The 3D foundation is not yet
  mounted by the current preview page or production Dear PyGui editor; subsequent
  Phase 2 tasks must add particle rendering and connect it through the controller.

