import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ParticleEngine } from "./preview.js";

const here = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(readFileSync(join(here, "engine_parity_baseline.json"), "utf8"));
const cases = [
  { name: "seeded-2d-fields", file: "sample_effect.json", seed: 123456 },
  { name: "seeded-3d-trails-fields", file: "sample_trail_effect.json", seed: 987654 },
];

for (const item of cases) {
  const effect = JSON.parse(readFileSync(join(here, "..", item.file), "utf8"));
  effect.emitter.seed = item.seed;
  effect.emitter.fields = {
    turbulence: { amount: 4, scale: 0.03, speed: 1.2 },
    vortex: { strength: 12 },
    attractor: { x: 20, y: -10, z: 5, strength: 30, radius: 500 },
    collision: { planeY: -300, bounce: 0.4, friction: 0.1 },
  };
  const engine = new ParticleEngine();
  engine.loadEffect(effect);
  const actual = [];
  for (let frame = 0; frame < 120; frame++) {
    engine.update(1 / 60, 13, -7);
    const particles = [];
    for (let i = 0; i < engine.activeCount; i++) {
      const state = engine.particleState(i);
      particles.push([state.x, state.y, state.z, state.age, engine.sampleAt(state.age, i)]);
    }
    const trails = engine.trailFrame();
    actual.push(createHash("sha256").update(JSON.stringify({ particles, trails })).digest("hex"));
  }
  assert.deepEqual(actual, expected[item.name], `${item.name} frame records changed from the pre-migration engine`);
  console.log(`${item.name}: all 120 seeded particle/trail frames match`);
}
console.log("ENGINE-PARITY-OK");
