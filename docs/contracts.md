# 🤝 Shared Contracts

← [Back to README](../README.md)

Everything that must stay identical across Python, C++, the browser preview, and the GDevelop extension lives in one place: [`contracts/contracts.json`](../contracts/contracts.json) — particle record layout, `SHAPE_ORDER`, easings, blend modes, export schema, and morph window.

[`tools/generate_contracts.py`](../tools/generate_contracts.py) regenerates the language bindings in [`contracts/gen/`](../contracts/gen/) (Python, C++ header, TypeScript reference, JSON Schema).

> **Edit the JSON, run the generator, never the outputs.** CI fails on stale files or drifted consumers.

## Consumers

- **Python** (`editor/particle_studio.py`) and the **C++ core** (`core/particle_core.cpp`) import the generated files directly.
- **TypeScript** (`preview/`, `carrots-runtime/`) and the **GDevelop extension** keep literal copies for bundling reasons; the check script verifies they match.

## Export format v1.1

- Validated against `contracts/gen/schema.json` on save and load.
- Easing values are hyphenated: `linear` / `ease-in` / `ease-out` / `ease-in-out`.
- `migrate_effect()` heals old files automatically: missing version, v1.0 → v1.1, camelCase easings, missing blend mode / seed.

## Particle record layout

```
[x, y, vx, vy, age, c0, c1, s0, s1, life, z, vz, shape, tracks,
 dx, dy, dz, gx, gy, gz, sizeRatio, speedRatio]
```
