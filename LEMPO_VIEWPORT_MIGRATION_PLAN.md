# Lempo Particle Editor — Viewport Migration Plan (Three.js 3D + PixiJS 2D)

> **Audience:** an AI coding agent that will implement this plan in the repo `Boy1developer/Lempo-FX`.
> **Read the whole document before writing any code.** Work phase by phase. Do not skip the acceptance criteria.

---

## 0. Rules for the agent

1. **Work in small, reviewable commits**, one task at a time. After each phase, run all existing tests (see §9) and the build (`python tools/rebuild_app.py`).
2. **Never hand-edit generated files.** Shared constants live in `contracts/contracts.json`. Edit it, then run `tools/generate_contracts.py`.
3. **Never change the export format (v1.1)**, the particle record layout, `SHAPE_ORDER` (12 shapes), easing names, blend-mode names, or deterministic-seed semantics (a nonzero `seed` must replay the identical effect). The GDevelop extension depends on all of these.
4. **Do not commit** `node_modules/`, `dist/`, `*.exe`, `*.pyd`, `*.lib`, `*.pdb`, `__pycache__/`.
5. **If something in this plan contradicts the actual code, trust the code**, document the discrepancy in `docs/viewport-migration-notes.md`, and adapt. This plan was written from `README.md` and `APP_STRUCTURE.md` only, not from reading `studio_imgui.py` line by line.
6. **Ask before deleting** any legacy path (drawlist viewport, `render/gl_view.py`). Deletion happens only in Phase 6, after parity is proven.
7. **Measure before and after** every performance-related change. No "optimization" without a number.

---

## 1. Goal and non-goals

### Goal
Replace the current triple viewport setup with **one** web-based viewport:

- **3D mode → Three.js** (editor-style viewport: orbit camera, transform gizmo, grid, view helper, emitter/zone/cone guides).
- **2D mode → PixiJS** (editor-style viewport: pan/zoom, grid, gizmo, guides).

Both run **the same particle engine code that ships in the GDevelop runtime**, so *what you see in the editor is what runs in the game*.

### Current state (from the docs)
There are three viewports and three simulations for one job:

| Viewport | Where | Notes |
|---|---|---|
| Dear PyGui drawlist | `editor/studio_imgui.py` | vector drawing, switches to offscreen texture above ~900 particles |
| Offscreen OpenGL 3.3 | `render/gl_view.py` | GLFW + raw ctypes, outputs PPM bytes |
| Browser preview | `preview/` (`three_scene.ts`, `pixi_scene.ts`, `preview.ts`, `main.ts`) | polls `preview/last_effect.json` every ~500 ms |

| Simulation | Where |
|---|---|
| Python reference | `editor/particle_studio.py` |
| C++ core | `core/particle_core.cpp` → `particle_core.pyd` |
| TypeScript | `preview/preview.ts` (`ParticleEngine`) and `carrots-runtime/` (GDevelop) |

### Non-goals (for this plan)
- Do **not** fork or embed the official `threejs.org/editor`. Take only individual addons (see §3).
- Do **not** rewrite the Dear PyGui side panels in this plan (that is the optional Phase 7).
- Do **not** add WebGPU. Use `WebGLRenderer` only (widest support on weak hardware).
- Do **not** change how effects are exported or how the GDevelop extension works.

---

## 2. Target architecture

```
┌──────────────────────── Editor process (Python) ────────────────────────┐
│  Dear PyGui panels (inspector, templates, trails, undo/redo)            │
│  effect JSON = single source of truth                                   │
│  ViewportBridge  ── JSON-lines over stdin/stdout ──┐                    │
└─────────────────────────────────────────────────────┼───────────────────┘
                                                      ▼
┌──────────────── Viewport host process (Python + pywebview) ─────────────┐
│  Relays messages ⇄ JS (evaluate_js / js_api). Owns the native window.   │
└─────────────────────────────────────────────────────┬───────────────────┘
                                                      ▼
┌──────────────────────── Viewport (TypeScript, in webview) ──────────────┐
│  ViewportController                                                     │
│    ├─ ThreeViewport (3D)  — three@0.185.1                               │
│    └─ PixiViewport  (2D)  — pixi.js @ GDevelop-matching version         │
│  Shared runtime engine (from carrots-runtime/) — same code as the game  │
│  QualityManager (tiers + adaptive resolution) · StatsHUD · Transport    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why a separate viewport-host process
Dear PyGui and pywebview both want to own the **main thread / event loop**. Running them in one process is fragile. Run the viewport as a **child process** (same exe launched with `--viewport-host` under PyInstaller). Do **not** try to embed a web view inside a Dear PyGui window (not supported).

### Why stdin/stdout and not WebSocket as the primary transport
The README states that `live_effect.html` was made self-contained with "zero network fetches" specifically to avoid localhost being blocked in some environments. So:

- **Primary transport:** JSON-lines over the child process's stdin/stdout, relayed to JS through pywebview (`window.evaluate_js` for Python→JS, `js_api` for JS→Python). No sockets involved.
- **Secondary transport (debug / external browser):** WebSocket bound to `127.0.0.1`, random port, random token in the handshake. Optional.
- **Legacy fallback:** the existing `last_effect.json` polling stays working until Phase 6.

Implement a `Transport` interface in TS with these three implementations behind it.

---

## 3. Version pins and dependencies

| Package | Version | Notes |
|---|---|---|
| `three` | **`0.185.1`** (exact, no `^`/`~`) | Latest patch of the 0.185 line. `0.185.0` is also acceptable if the owner prefers. The repo currently pins `0.186`, so this is a **downgrade**: after changing it, run all preview tests and fix any API differences. |
| `pixi.js` | **Match the version GDevelop bundles** | The repo currently has `pixi.js@8.21`. In Phase 0, determine which Pixi major GDevelop ships (Pixi 7 and 8 differ in API and blend-mode behavior). Pin the viewport to the same major, preferably exact. If they differ, record it in the notes doc and tell the owner. |
| `typescript`, `esbuild` | keep what `package.json` has | |
| Optional: `pixi-viewport` | only if compatible with the pinned Pixi | otherwise implement pan/zoom by hand (it is ~80 lines) |

### Three.js 0.185.1 facts verified against the published package
- Addons are importable as `three/addons/...` (maps to `examples/jsm/*`). Needed:
  - `three/addons/controls/OrbitControls.js`
  - `three/addons/controls/TransformControls.js`
  - `three/addons/helpers/ViewHelper.js`
- **`THREE.Clock` is deprecated since r183 and logs a warning.** Use **`THREE.Timer`** instead:
  ```ts
  const timer = new THREE.Timer();
  timer.connect(document);          // uses Page Visibility API → no huge dt after tab/window hidden
  function frame(ts: number) {
    timer.update(ts);               // pass the rAF timestamp
    const dt = Math.min(timer.getDelta(), 1 / 20); // clamp
    // ...
  }
  ```
- `renderer.compileAsync(scene, camera)` exists → use it to pre-compile shaders (see §7.2).
- `BufferAttribute.addUpdateRange(start, count)` / `clearUpdateRanges()` exist → use them to upload only the live part of instance buffers.
- `build/three.module.js` imports from `./three.core.js`. **If any code path loads `three.module.js` unbundled** (e.g. the PyInstaller `datas` entry copies only `three.module.js`), also ship `build/three.core.js`. If everything goes through esbuild into one bundle, this does not matter. Verify.
- Import from `'three'` and `'three/addons/...'` only. Never mix two copies of three (duplicate bundling breaks `instanceof` checks and doubles size).

---

## 4. Contracts the agent must create

### 4.1 `Viewport` interface (TypeScript)

Create `preview/viewport/Viewport.ts`:

```ts
export type Mode = '2d' | '3d';
export type Tool = 'select' | 'move' | 'zone';
export type Tier = 'low' | 'medium' | 'high';

export interface ViewportStats {
  fps: number; frameMs: number; p95Ms: number;
  drawCalls: number; triangles: number;
  particles: number; particlesCap: number | null;
  dpr: number; renderScale: number; tier: Tier;
}

export interface Viewport {
  mount(el: HTMLElement): void;
  dispose(): void;                              // MUST free every GPU resource (see §7.9)

  setEffect(effect: EffectJSON): void;          // full load; resets state
  patch(ops: PatchOp[]): void;                  // incremental edit; no full rebuild unless required
  play(): void; pause(): void; restart(): void; seek(t: number): void;

  setTool(t: Tool): void;
  setView(opts: { grid?: boolean; guides?: boolean; stats?: boolean }): void;
  setQuality(q: Tier | 'auto'): void;
  resize(w: number, h: number, dpr: number): void;

  on(ev: 'emitterMoved', cb: (p: { x: number; y: number; z?: number }) => void): void;
  on(ev: 'pick',         cb: (p: { id: string | null }) => void): void;
  on(ev: 'stats',        cb: (s: ViewportStats) => void): void;
  on(ev: 'error',        cb: (m: { message: string }) => void): void;
}

export type PatchOp = { path: string; value: unknown };   // JSON Pointer, e.g. "/emitters/0/rate"
```

`ThreeViewport` and `PixiViewport` both implement it. A `ViewportController` owns the current instance and swaps them on 2D↔3D change (`dispose()` the old one **before** `mount()`-ing the new one; one canvas per mode).

### 4.2 Wire protocol (JSON, one message per line)

Every message: `{ "type": string, "seq": number, ...payload }`. `seq` is monotonically increasing per sender; the receiver drops anything older than the last applied `seq` of the same `type`.

**Editor → Viewport**

| type | payload |
|---|---|
| `setEffect` | `{ mode: '2d'\|'3d', effect: EffectJSON }` |
| `patch` | `{ ops: [{ path, value }] }` |
| `transport` | `{ action: 'play'\|'pause'\|'restart'\|'seek', t?: number }` |
| `setTool` | `{ tool }` |
| `setView` | `{ grid?, guides?, stats? }` |
| `setQuality` | `{ quality: 'low'\|'medium'\|'high'\|'auto' }` |
| `shutdown` | `{}` |

**Viewport → Editor**

| type | payload |
|---|---|
| `ready` | `{ three: '0.185.1', pixi: string, webgl2: boolean, renderer: string }` |
| `emitterMoved` | `{ x, y, z? }` (preview-only gizmo; exports stay centered on the GDevelop object) |
| `pick` | `{ id }` |
| `stats` | `ViewportStats`, **max 1 Hz** |
| `error` | `{ message, stack? }` |

**Rules**
- **Coalesce on the sender:** during a slider drag, Python sends at most ~30 `patch` messages/s; the viewport additionally applies only the **last value per path per animation frame**.
- Patches for the same `path` are last-write-wins.
- Never send the full effect on a slider change. Full `setEffect` only on load, template apply, undo/redo of structural changes, or 2D↔3D switch.
- If the effect has `seed != 0`, a parameter change implies restart. Provide a toggle **"Restart on edit"** in the editor (default on when seeded, off otherwise).

---

## 5. Phased plan

### Phase 0 — Recon, spikes, baselines (no behavior change)

**Tasks**
1. Read `studio_imgui.py` and list every place that draws into the viewport, handles viewport mouse input, or writes `preview/last_effect.json`. Write the list into `docs/viewport-migration-notes.md`.
2. **Diff `preview/preview.ts` (`ParticleEngine`) against `carrots-runtime/`.** Document every behavioral difference (morph window `(0.25, 0.75)`, zone/cone emission, force fields, seed handling, trails, blend fallbacks).
3. Determine which **three** and **pixi.js** versions GDevelop bundles. Record the result.
4. **Spike A:** a minimal Python script that launches DPG and a pywebview child process simultaneously and does a JSON-lines round trip. Measure latency (target < 5 ms median).
5. **Spike B:** confirm the pywebview child can be launched from the PyInstaller exe via `--viewport-host`. Confirm the Windows WebView2 runtime requirement and document the fallback if missing (open default browser with the self-contained `live_effect.html`).
6. **Baselines:** record frame time (p50/p95), draw calls, and CPU for the four built-in templates (Explosion, Fire, Rain, Snow, 2D and 3D) in the *current* viewport. Save to `bench/baseline-viewport.json`.
7. Downgrade `three` to `0.185.1` in `package.json`; run `npm ci`; run the existing preview tests; fix any breakage.

**Acceptance:** notes doc exists and answers items 1–3; spikes A and B succeed (or failure + fallback documented); baseline file committed; existing tests pass on three 0.185.1.

### Phase 1 — Single runtime engine

**Goal:** the viewport uses the same simulation code as the game.

**Tasks**
1. Make `carrots-runtime/` the single source for the TS particle engine. Move shared pure logic (simulation, easing, morph, zone/cone, force fields, trails math, seeded PRNG) into a renderer-agnostic module (e.g. `carrots-runtime/engine/`) that **does not import three or pixi**.
2. `preview/preview.ts` re-exports from it; remove duplicated logic.
3. Keep renderer adapters thin: `engine → typed arrays → ThreeViewport / PixiViewport`.
4. Ensure the extension build (`tools/patch_trails_ext.py`, `AdvancedParticleEmitter.json` generation) still produces the same output (diff before/after).

**Acceptance:** `preview/test_engine.mjs`, `test_engine3d.mjs`, `test_guides.mjs` pass; extension output unchanged (byte-identical or explained); seeded effect produces identical particle records frame-by-frame before and after the refactor (write a test).

### Phase 2 — `Viewport` interface + the two viewports

**Tasks (shared)**
1. Create `preview/viewport/` with: `Viewport.ts`, `ViewportController.ts`, `QualityManager.ts`, `StatsHUD.ts`, `Transport.ts` (+ `StdioTransport`, `WebSocketTransport`, `PollingTransport`).
2. Single `requestAnimationFrame` loop owned by the controller (see §7.1).
3. Bundle with esbuild into the existing self-contained `live_effect.html` pipeline (still zero network fetches).

**Tasks (3D — `ThreeViewport`)**
1. `WebGLRenderer` with options from §7.3. Perspective camera + `OrbitControls` (damping **off** on low tier; damping needs continuous rendering).
2. `TransformControls` attached to the emitter gizmo only while tool = `move`; on drag, emit `emitterMoved`.
3. `ViewHelper` (axis cube) rendered in the corner **only when the camera changed**.
4. `GridHelper` + emitter/zone/cone guides built **once**, toggled with `.visible`.
5. Particle rendering with `InstancedMesh` buckets per **(shape × blend mode)** exactly as already described in the README (lazy buckets, pooled meshes/materials, classic-path fallback). Follow §7.5.
6. Trails/ribbons as one preallocated dynamic `BufferGeometry` per emitter (§7.6).
7. Custom models (`.glb/.gltf/.obj`): load once, cache, instance. Rigged GLBs are baked to rest pose (existing behavior, keep).
8. Blend modes per the README table: Normal, Additive, Subtractive, Multiply, Screen (custom `ONE, ONE_MINUS_SRC_COLOR`), Lighten (custom max equation), Overlay → Normal with a **single** `console.warn` (never per frame).

**Tasks (2D — `PixiViewport`)**
1. Pixi `Application`/renderer with options from §7.3. World container with pan (middle mouse / space+drag) and wheel zoom around the cursor.
2. Grid and guides as cached `Graphics` (redraw only on zoom/resize, not per frame).
3. Gizmo for the emitter with drag → `emitterMoved`.
4. Particles per §7.7 (batched, shared textures, no per-frame `Graphics` redraws).
5. Blend modes per the README table: Normal, Add, Erase (Subtractive), Multiply, Screen, Overlay; Lighten → Normal with a single `console.warn`.
6. Trails/ribbons as dynamic meshes (quad strips), pooled.

**Acceptance:** both viewports pass `Viewport` contract tests (mount → setEffect → patch → dispose, 100 cycles, no resource growth — see §7.9); 2D↔3D switching works; blend-mode fallbacks warn exactly once; stats HUD works.

### Phase 3 — Bridge (Python side)

**Tasks**
1. `editor/viewport_bridge.py`: spawns the viewport-host child, owns the JSON-lines pipe, exposes `set_effect()`, `patch()`, `transport()`, `set_tool()`, etc., and an event callback API (`on_emitter_moved`, `on_pick`, `on_stats`).
2. `editor/viewport_host.py`: pywebview window loading the bundled viewport page; relays stdin↔JS. Must exit cleanly if the parent dies (watch stdin EOF).
3. Hook the bridge into `studio_imgui.py` **behind a feature flag** (`LEMPO_VIEWPORT=web|legacy`, default `legacy` until Phase 5 passes).
4. Throttle/coalesce patches per §4.2. Use the effect JSON's undo/redo history as the source: slider drag = many patches, one undo step on release (preserve existing 100-step undo/redo behavior).
5. Replace the `last_effect.json` polling path with the bridge when the flag is `web`; keep the file written for the legacy preview.

**Acceptance:** with `LEMPO_VIEWPORT=web`, editing any inspector value updates the viewport within ≤ 1 frame of receipt; dragging the gizmo updates the inspector; closing the editor closes the viewport process (no orphans); closing the viewport window is detected and offered to reopen.

### Phase 4 — Editor UX parity

Match what the old viewport did: grid, guides (zone/cone), vignette (cosmetic, optional), emitter gizmo, world-space 2D zoom, trail mode display (ribbons shown, particle dots hidden — "exactly like the editor viewport"), per-state colors, gradual shape morph display, play/pause/restart. Keyboard shortcuts must keep working (focus handling between the DPG window and the viewport window is a known pain point — document the behavior and forward key events from the viewport to Python where needed).

**Acceptance:** a checklist in the notes doc with every legacy viewport feature marked ✅/❌ and justified.

### Phase 5 — Parity tests and performance gates

1. **Golden-image tests** (also on the project's roadmap): render the same seeded effect at fixed times (e.g. t = 0.5 s, 1 s, 2 s) in the new viewport via headless Chromium (Playwright) and compare against reference images with a small tolerance. Cover all 12 shapes, all 7 blend modes (with fallbacks), trails, force fields, morph.
2. **Particle-record parity:** seeded effect → TS engine records == Python/C++ records within existing tolerances (reuse `core/test_parity.py` reference data where possible).
3. **Performance gate** (see §9): meets the budgets on the benchmark harness, with a 6× CPU throttle and with software rendering.

**Acceptance:** all green in CI; benchmark report committed to `bench/`.

### Phase 6 — Deprecate legacy paths

Only after the owner approves:
1. Default `LEMPO_VIEWPORT=web`.
2. Remove the drawlist viewport drawing code, `render/gl_view.py` and its tests, and the Python/C++ **viewport** simulation path. **Keep** the C++ core and Python reference if they are still used by tests/tools; otherwise ask the owner.
3. Update `APP_STRUCTURE.md`, `README.md` (features list, project structure, roadmap) and `packaging/LempoParticleEditor.spec` (remove `glfw3.dll`/`render` datas if unused; add the viewport bundle).
4. Rebuild: `python tools/rebuild_app.py`.

### Phase 7 — Optional: move the panels to the web (single window)

Out of scope unless the owner asks. If asked: Vite + TS, generate the Trails inspector from `TRAIL_SCHEMA` (79 keys) and the rest from `contracts.json`, package with Tauri/Electron or pywebview; Python becomes tooling only.

---

## 6. File layout to create

```
preview/viewport/
  Viewport.ts            ViewportController.ts   QualityManager.ts
  StatsHUD.ts            Transport.ts
  three/ThreeViewport.ts three/buckets.ts  three/ribbons.ts  three/gizmos.ts
  pixi/PixiViewport.ts   pixi/particles.ts pixi/ribbons.ts   pixi/gizmos.ts
  index.html             (template for the self-contained bundle)
editor/
  viewport_bridge.py     viewport_host.py
bench/
  viewport_bench.mjs     baseline-viewport.json
tests/
  test_viewport_bridge.py
preview/
  test_viewport_contract.mjs   test_viewport_golden.mjs
docs/
  viewport-migration-notes.md  viewport-performance.md
```

---

## 7. Performance playbook (target: stay near 60 FPS on weak PCs, integrated GPUs, and old laptops)

> The numbers below are **starting values**. Tune them with the benchmark harness (§9) and keep the final values in `docs/viewport-performance.md`.

### 7.1 The loop
- **One** `requestAnimationFrame` loop for the whole viewport. In Pixi, disable the built-in ticker auto-start (`autoStart: false` / `ticker.stop()`) and drive `renderer.render()` yourself. Never run two loops.
- **Render on demand:** keep a `dirty` flag. When paused **and** the camera/gizmo/inspector did not change, do not render (≈ 0 % GPU). When playing, render every frame.
- **Stop when invisible:** pause the loop when `document.hidden`, when the window is minimized, or via `IntersectionObserver` when the canvas is not visible.
- **Clamp `dt`** to `1/20 s` and use a **fixed-step accumulator** for the simulation (e.g. 1/60 s step, max 3 steps per frame). Never let a long frame cause a simulation spiral.
- With `THREE.Timer.connect(document)` large deltas after tab-switch are avoided automatically.

### 7.2 Avoid hitches
- **Pre-compile shaders on load:** after building buckets in `setEffect`, call `await renderer.compileAsync(scene, camera)` before the first visible frame, so the first particle burst does not stall.
- **Pre-warm pools:** pre-create the meshes/materials/textures for the shapes the effect uses; create lazily only for shapes added later.
- **No allocations in the frame loop** (see §7.4).
- Defer heavy work (GLB parsing, texture decode, LUT baking) off the frame: do it in `setEffect`, behind a loading state, or with `await`.

### 7.3 Renderer options and quality tiers

`WebGLRenderer` for **low** tier:
```ts
new THREE.WebGLRenderer({
  canvas,
  antialias: false,                 // biggest fill-rate saver; high tier may enable MSAA
  alpha: false,                     // opaque canvas composites faster; draw background yourself
  stencil: false,
  depth: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.maxDpr) * renderScale);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.NoToneMapping;
```
Pixi: `antialias: false`, `resolution` capped the same way, `autoDensity: true`, `powerPreference: 'high-performance'`, `roundPixels: true` (low tier).

| Setting | low | medium | high |
|---|---|---|---|
| max device pixel ratio | 1.0 | 1.5 | 2.0 |
| antialias | off | off | on |
| viewport particle cap | 600 | 1500 | 4000 |
| trail segments (max) | 8 | 16 | 32 |
| sphere/torus geometry detail | ~8×6 | ~12×8 | ~16×12 |
| shadows | off | off | opt-in (1024 map) |
| lights | 0–1 | ≤ 2 | ≤ 3 |
| helpers (view helper, extra guides) | minimal | all | all |
| materials | `MeshBasicMaterial` | `MeshBasicMaterial` / lit if enabled | lit allowed |

**Important honesty rule:** if the **viewport particle cap** truncates an effect, show a visible banner ("Preview capped: 600 / 2000 particles") so the user is never misled. The cap affects the preview only, **never the export**.

### 7.4 Zero garbage in hot paths
- Store particles as **Structure-of-Arrays in `Float32Array`s** (the contract's record has 22 fields). No per-particle objects.
- Preallocate and reuse `Vector3`, `Matrix4`, `Quaternion`, `Color`, `Object3D` dummies. No `new` inside the loop.
- No `map/filter/forEach/reduce`, spread, destructuring-allocation, or closures created per frame in hot loops. Use indexed `for` loops.
- Remove dead particles by **swap-with-last** (O(1)), not `splice`.
- Pre-bake easings, curves and gradients into **LUTs** (already done for trails; extend to size/alpha/color over life).
- Do not use `Math.pow`/`sqrt` per particle if a LUT or a cheaper form exists. Compare squared distances.
- Seeded PRNG must remain the one defined by the contracts. Do not substitute `Math.random` when `seed != 0`.

### 7.5 Three.js particles (`InstancedMesh`)
- One `InstancedMesh` per **(shape × blend mode)** bucket. Create `InstancedMesh` with the **max capacity** for the tier; then each frame set `mesh.count = aliveInBucket` (do **not** toggle per-instance visibility). Empty bucket → `mesh.visible = false` (zero draw calls).
- `mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)` (and the same for `instanceColor` and any custom per-instance attribute).
- Write matrices straight into `mesh.instanceMatrix.array` (compose manually: position, scale, optional rotation) instead of calling `setMatrixAt` with fresh `Matrix4` objects. Then `instanceMatrix.needsUpdate = true`.
- **Upload only what changed:** `attr.clearUpdateRanges(); attr.addUpdateRange(0, aliveCount * itemSize);` so the GPU upload scales with alive particles, not capacity.
- **Per-particle alpha** via an `InstancedBufferAttribute` read in the shader (inject with `onBeforeCompile` into `MeshBasicMaterial`), not per-instance material clones.
- **`mesh.frustumCulled = false`** for dynamic buckets. Culling an `InstancedMesh` uses a bounding sphere computed from all instances; recomputing it every frame is expensive, and not recomputing it gives wrong culling. Particles are bounded by the effect anyway.
- **Do not depth-sort per particle.** Prefer order-independent blending (Additive/Screen/Multiply) where visuals allow. For Normal blend: `depthWrite = false`, sort **buckets** (not particles), and only re-sort buckets when the camera moved.
- Share one `BufferGeometry` and one material per bucket via the existing pools; never create geometry/materials per effect rebuild if an identical one exists.
- Low-poly geometries on low tier (§7.3). Billboards = 1 quad.
- **Overdraw is the #1 killer on weak GPUs**: many large, transparent, overlapping quads. Mitigations: lower DPR (adaptive scale below), set particles with alpha < ~0.01 or scale ~0 to *not* be drawn (skip in the write loop), smaller textures, cap size × count on low tier.

### 7.6 Trails / ribbons
- One **preallocated** `BufferGeometry` per emitter with max vertex/index counts for the tier; update `position/color/uv` typed arrays in place; `setDrawRange(0, usedIndices)`; mark `needsUpdate` and use `addUpdateRange`.
- Cap segments per tier (§7.3); apply the existing "stride caps" when the total ribbon vertex budget is exceeded.
- Pool ribbons; never `new BufferGeometry()` per frame or per particle.
- Bake width curve and color gradient to LUTs once per change (not per frame).

### 7.7 Pixi particles
- Use Pixi's **particle-optimized container** for the pinned version (v8: `ParticleContainer` + `Particle`, with `dynamicProperties` set to only what changes per frame — typically position/rotation/color; v7: `ParticleContainer` with `setProperties`). **Check the actual API of the pinned version before coding.**
- One shared small texture per shape (e.g. 64×64, no mipmaps). Bake vector shapes (`circle, square, triangle, star, diamond, line`) to textures **once** (`renderer.generateTexture`), never redraw `Graphics` per frame.
- **Blend-mode switches break batches.** Group emitters by blend mode so there is one container per blend mode.
- No filters/masks on the particle layer (very expensive on weak GPUs).
- Redraw grid/guides only on zoom/resize/toggle.
- Render only when dirty (§7.1).

### 7.8 Adaptive resolution (`QualityManager`)
Auto mode, applied to `renderScale` (multiplies the capped DPR):
1. Keep an EMA of frame time over ~30 frames (and a rolling p95 for stats).
2. If EMA > **20 ms** for **1 s** → `renderScale -= 0.15` (min **0.5**).
3. If EMA < **12 ms** for **3 s** → `renderScale += 0.05` (max **1.0**), with hysteresis so it does not oscillate.
4. If at `renderScale = 0.5` it still exceeds budget for 3 s → drop one **tier** (high→medium→low), apply the tier's caps, and show a small toast "Quality lowered for performance".
5. Never change quality while the user is dragging a slider/gizmo (avoid visual popping); apply on release.
6. Provide a manual override (`setQuality('low'|'medium'|'high')`) and persist the choice.

Resizing the drawing buffer is cheap; do it on tier/scale change only, debounced.

### 7.9 Memory and disposal
- `dispose()` must release: geometries, materials, textures, render targets, GLB resources, event listeners, the rAF handle, `TransformControls`/`OrbitControls` (`.dispose()`), and the WebGL context if the canvas is discarded (`renderer.dispose()`; consider `renderer.forceContextLoss()` when switching modes permanently).
- Contract test: **100 cycles** of `mount → setEffect → patch×N → dispose`; `renderer.info.memory.geometries/textures` and JS heap must return to baseline (± small tolerance).
- Keep `renderer.info.render.calls/triangles` visible in the HUD to catch regressions.

### 7.10 Bridge efficiency
- Coalesce and rate-limit patches (§4.2). Do not serialize the whole effect per slider tick.
- `stats` at ≤ 1 Hz.
- JSON-lines are fine for control messages; do **not** stream per-frame particle data across the process boundary — the simulation runs inside the viewport.

### 7.11 Interaction cost
- `OrbitControls`: `enableDamping = false` on low tier (damping forces continuous re-render).
- Raycasting for picking only on click, never on every `pointermove`.
- Gizmo/TransformControls exist only when tool = `move`; detach and `dispose()` otherwise.
- `ViewHelper`: render only when the camera orientation changes.

### 7.12 Build / startup
- Single esbuild bundle, minified, tree-shaken: import specific classes from `three`; avoid `import * as THREE` in the bundle entry if tree-shaking suffers (check bundle size; the current `live_bundle.js` is ~4900 lines unminified).
- Lazy-load GLTF/OBJ loaders only when a custom model is used.
- Keep the self-contained page free of network fetches.

### 7.13 Things that look like optimizations but are not (avoid)
- Multiple `requestAnimationFrame` loops or `setInterval` rendering.
- `Object3D` per particle.
- Per-particle `Sprite`/`Mesh` objects in the scene graph.
- Re-creating geometries/materials on every slider change.
- `preserveDrawingBuffer: true` (only for screenshot tests; enable it in test builds only).
- MSAA on low tier, shadows by default, post-processing passes in the viewport.

---

## 8. Known pitfalls

1. **Three 0.186 → 0.185.1 downgrade:** re-run all preview tests; search for deprecation warnings in the console (`Clock`, etc.).
2. **Pixi version mismatch with GDevelop** gives subtly different blend behavior and API. Resolve in Phase 0.
3. **Focus/keyboard** between the DPG window and the webview window: forward needed shortcuts; document anything that cannot be fixed.
4. **High-DPI:** compute canvas size = CSS size × effective DPR; keep gizmo hit-testing in CSS pixels.
5. **Determinism:** do not introduce any new use of `Math.random`, `Date.now`, or frame-rate-dependent integration in the simulation path. Fixed-step simulation is what keeps seeded effects identical at any FPS.
6. **Subtractive/Lighten/Overlay fallbacks:** warn once, never per frame, never throw.
7. **Orphan processes:** the viewport host must exit when stdin closes.
8. **WebView2 missing on some Windows installs:** fall back to opening the self-contained HTML in the default browser with `WebSocketTransport` or `PollingTransport`.

---

## 9. Testing and benchmarks

### Existing tests to keep green
`tests/test_imgui_*.py`, `tests/test_trails_*.py`, `core/test_parity.py` (99/99), `core/test_behavior.py`, `render/test_*.py` (until Phase 6), `preview/test_engine.mjs`, `test_engine3d.mjs`, `test_guides.mjs`, `preview/test_server.py`.

### New tests
- `preview/test_viewport_contract.mjs`: both viewports against the `Viewport` interface; patch semantics; 100-cycle dispose/leak check.
- `preview/test_viewport_golden.mjs`: Playwright + headless Chromium golden images (fixed seed, fixed times).
- `tests/test_viewport_bridge.py`: spawn host, round-trip, coalescing, orphan cleanup, malformed-message handling.

### Benchmark harness (`bench/viewport_bench.mjs`)
Scripted scenes: Explosion, Fire, Rain, Snow (2D and 3D), plus one heavy scene (≈ 2000 particles + trails + additive blending). For each, run 10 s after warm-up and report **p50 / p95 frame ms, draw calls, triangles, alive particles, JS heap, GC pauses if available**. Run in three conditions:
1. Normal.
2. Chrome DevTools-style **CPU throttle 6×** (via CDP `Emulation.setCPUThrottlingRate`).
3. **Software rendering** (e.g. `--use-gl=angle --use-angle=swiftshader`) as a worst-case GPU proxy.

### Budgets (targets, to be confirmed by measurement)
| Stage | Budget per frame |
|---|---|
| Simulation | ≤ 2 ms |
| Buffer upload | ≤ 1 ms |
| Render submit + GPU | ≤ 6 ms (normal), degrade via §7.8 when exceeded |
| Total | ≤ 16.6 ms (60 FPS) on the normal run; ≥ 30 FPS p95 under the 6× throttle on low tier |

**Gate:** the new viewport must be **no worse than the baseline** from Phase 0 on every scene, and must meet the budgets on at least the low tier.

### Debug HUD
Toggle with **F3**: FPS, frame ms (EMA + p95), draw calls, triangles, alive/cap particles, DPR × renderScale, tier, renderer string (`WEBGL_debug_renderer_info` if available), transport type and message rate.

---

## 10. Definition of done

- [ ] 3D viewport uses `three@0.185.1` (exact pin); no `Clock` deprecation warnings.
- [ ] 2D viewport uses Pixi at the GDevelop-matching version.
- [ ] Both run the shared runtime engine; no duplicated simulation in `preview/`.
- [ ] Bridge works over stdio; WebSocket/polling fallbacks exist; no orphan processes.
- [ ] All legacy viewport features are matched or explicitly waived (Phase 4 checklist).
- [ ] Golden-image and particle-record parity tests pass in CI.
- [ ] Performance gate met; adaptive quality works; capped-preview banner shown when applicable.
- [ ] Export format v1.1 and GDevelop extension output unchanged.
- [ ] Docs updated (`README.md`, `APP_STRUCTURE.md`, `docs/viewport-performance.md`, `docs/viewport-migration-notes.md`).
- [ ] `python tools/rebuild_app.py` succeeds and the smoke test passes.

---

## 11. Suggested order of the first PRs

1. `chore: pin three@0.185.1, fix breakages, baseline bench`
2. `docs: viewport migration notes (recon results)`
3. `refactor: single runtime engine in carrots-runtime`
4. `feat: Viewport interface + QualityManager + StatsHUD`
5. `feat: ThreeViewport (instanced buckets, controls, gizmos)`
6. `feat: PixiViewport (particle container, pan/zoom, gizmos)`
7. `feat: viewport bridge + host (behind LEMPO_VIEWPORT flag)`
8. `test: contract + golden + bridge tests, bench gate`
9. `chore: switch default to web viewport; remove legacy (after owner approval)`
