# 🧪 Testing

← [Back to README](../README.md)

CI runs the parity, behavior, and contract checks on every push (`.github/workflows/ci.yml`).

> **Naming note:** the editor UI is built on Dear PyGui, which wraps Dear ImGui — that is why the UI test files are prefixed `test_imgui_`.

## Full test matrix

| Test | Covers |
| --- | --- |
| `core/test_parity.py` | Python vs C++ simulation output — 99/99 passing |
| `core/test_behavior.py` | Simulation behavior, morph-window keys, performance (~2–3 ms @ 2,000 particles) |
| `tests/test_imgui_build.py` | UI builds without errors (blend dropdown, seed box, force-field widgets) |
| `tests/test_imgui_logic.py` | Headless simulation logic (C++ path) |
| `tests/test_imgui_nav.py` | Viewport navigation (WASD/arrows, Q/E, F, Shift×3) + sidebar splitter hover/drag |
| `tests/test_imgui_color.py` | Per-state color persistence across birth/death switches |
| `tests/test_imgui_mesh.py` | Uploaded models render as meshes, tint, culling, LOD |
| `tests/test_imgui_morph.py` | Shape cross-fade window (edges, split alpha, legacy fallback) |
| `tests/test_imgui_upload.py` | Upload chain, OBJ parsing, big-JSON node names, bone-node fallback |
| `tests/test_imgui_raster.py` | Raster path: PPM conversion, GL orientation, auto-switch, no-GL fallback |
| `tests/test_preview_blobs.py` | Model-blob embedding for the browser preview |
| `tests/test_contracts.py` | Generated bindings = source, C++ order, schema accept/reject, migration |
| `tests/test_gl_blend.py` | Pixel-level GL formulas per blend mode + fallbacks |
| `tests/test_blend_modes.py` | Blend round-trip, sanitize, sample layers |
| `tests/test_seed.py` | Seed replay identical (Python + C++), divergence, seed-0 legacy |
| `tests/test_fields.py` | Field formulas, off-identical, perturb/replay, collision, attractor (Py + C++) |
| `preview/test_blend.mjs` | Extension blend mappings + resolution (stubbed runtimes) |
| `preview/test_seed.mjs` | Preview replay identical + extension RNG extraction |
| `preview/test_fields.mjs` | Extension helpers == Python + preview field behavior |
| `preview/test_trails.mjs` | Preview trails: bake parity vs Python (exact), store semantics, engine wiring 2D/3D, style helpers |
| `preview/test_ext_trails.mjs` | Extension trails: shipped-helper parity, 3D ribbons/hide (real three.js), 2D ribbons/hide (stub PIXI), hybrid + legacy |
| `preview/test_ext_runtime.mjs` | Shipped 3D runtime headless (stub gdjs + real three.js) |
| `preview/test_engine.mjs`, `test_engine3d.mjs`, `test_guides.mjs`, `test_server.py` | Browser preview engine, 2D/3D scene layers, guides |
| `preview/test_models.mjs` | Model-blob caching and live-push behavior |
| `preview/test_morph.mjs` | Preview-side `morphAt()` cross-fade sampling |
| `preview/test_bake.mjs` / `test_ext_bake.mjs` | Skinned-mesh rest-pose baking (preview + shipped extension) |
| `tests/test_trails_schema.py` | `TRAIL_SCHEMA` ↔ defaults sync, clamps, LUT sizes |
| `tests/test_trails_roundtrip.py` | Trail files byte-stable round-trip + old-file heal |
| `tests/test_trails_parity.py` | Python ↔ C++ trail width/gradient/scalars |
| `tests/test_trails_perf.py` | Trail update/bake perf budgets |
| `tests/test_trails_flow.py` | Time/distance emission, exact spacing, tick FIFO, trail death |
| `tests/test_trails_render.py` | Ribbon-strip math + viewport smoke |
| `tests/test_trails_templates.py` | 27 templates load/search/apply, thumbnails, user-preset round-trip |
| `tests/test_view2d_zoom.py` | World-space 2D zoom math, anchors, raster agreement |
| `tools/check_perf.py` | CI perf gate: C++ throughput floor |
| `render/test_gl.py`, `test_clip.py`, `test_cost.py` | GL context init, projection parity, render-cost profiling |
