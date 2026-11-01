import assert from "node:assert/strict";
import { QualityManager } from "./viewport/QualityManager.js";

const quality = new QualityManager();
quality.setQuality("auto");
let changes = 0;
for (let i = 0; i < 600; i++) if (quality.recordFrame(40, 1 / 30)) changes++;
assert.ok(changes > 1, "sustained slow frames should lower render scale and tier");
assert.equal(quality.currentTier, "low");
assert.ok(quality.scale >= 0.5 && quality.scale <= 1);

let recovered = false;
for (let i = 0; i < 300; i++) recovered ||= quality.recordFrame(8, 1 / 60);
assert.ok(recovered, "sustained fast frames should raise render scale");
assert.ok(quality.scale <= 1 && quality.scale > 0.5);
assert.ok(quality.p95FrameMs >= 8);

quality.setQuality("low");
for (let i = 0; i < 300; i++) quality.recordFrame(50, 1 / 60);
assert.equal(quality.currentTier, "low", "manual quality must disable adaptation");
assert.equal(quality.scale, 1);

const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const persisted = new QualityManager(storage);
persisted.setQuality("medium");
assert.equal(values.get("lempo.viewport.quality"), "medium");
assert.equal(new QualityManager(storage).currentTier, "medium", "manual tier should persist across controller lifetimes");
persisted.setQuality("auto");
assert.equal(values.get("lempo.viewport.quality"), "auto", "auto preference should persist too");

console.log("Viewport adaptive quality thresholds and persistence passed.");
