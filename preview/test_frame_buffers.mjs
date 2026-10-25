import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ParticleEngine } from "./preview.js";
import { SHAPE_ORDER } from "../lempo-runtime/src/index.js";

for (const file of ["../sample_effect.json", "../sample_trail_effect.json"]) {
  const effect = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
  effect.emitter.seed = 1776;
  const engine = new ParticleEngine();
  engine.loadEffect(effect);
  for (let frameIndex = 0; frameIndex < 20; frameIndex++) engine.update(1 / 60, 20, 30);
  const frame = engine.writeFrame();
  assert.equal(frame.count, engine.activeCount);
  assert.ok(frame.position instanceof Float32Array);
  assert.ok(frame.age instanceof Float32Array);
  assert.ok(frame.size instanceof Float32Array);
  assert.ok(frame.color instanceof Uint8Array);
  assert.ok(frame.alpha instanceof Float32Array);
  assert.ok(frame.shape instanceof Uint8Array);
  const buffers = [frame.position, frame.age, frame.size, frame.color, frame.alpha, frame.shape];
  for (let i = 0; i < frame.count; i++) {
    const p = i * 3;
    const particle = engine.particleState(i);
    const sample = engine.sampleAt(particle.age, i);
    assert.deepEqual(Array.from(frame.position.subarray(p, p + 3)), [particle.x, particle.y, particle.z]);
    assert.equal(frame.age[i], particle.age);
    assert.ok(Math.abs(frame.size[i] - sample.size) < 1e-5);
    assert.deepEqual(Array.from(frame.color.subarray(p, p + 3)), [sample.r, sample.g, sample.b]);
    assert.ok(Math.abs(frame.alpha[i] - sample.a) < 1e-5);
    assert.equal(SHAPE_ORDER[frame.shape[i]], sample.shape);
  }
  engine.update(1 / 60, 20, 30);
  const next = engine.writeFrame();
  assert.ok(buffers.every((buffer, i) => buffer === [next.position, next.age, next.size, next.color, next.alpha, next.shape][i]),
    "frame buffers must be reused across updates");
}
console.log("FRAME-BUFFERS-OK");
