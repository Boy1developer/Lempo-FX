import assert from "node:assert/strict";
import { ViewportController } from "./viewport/ViewportController.js";
import { StatsHUD } from "./viewport/StatsHUD.js";

globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

class FakeDocument extends EventTarget {
  visibilityState = "visible";
}

class ContractViewport {
  static order = [];
  name;
  constructor(name) { this.name = name; }
  mount() { ContractViewport.order.push(`${this.name}:mount`); }
  dispose() { ContractViewport.order.push(`${this.name}:dispose`); }
  setEffect(value) { this.effect = structuredClone(value); }
  patch(ops) {
    for (const { path, value } of ops) {
      const key = path.slice(1);
      this.effect[key] = value;
    }
  }
  play() {}
  pause() {}
  restart() {}
  seek() {}
  update() {}
  render() {}
  setTool() {}
  setView() {}
  setQuality() {}
  resize() {}
  on() {}
}

const doc = new FakeDocument();
const controller = new ViewportController(doc);
for (let cycle = 0; cycle < 100; cycle++) {
  const mode = cycle % 2 === 0 ? "2d" : "3d";
  controller.setViewport(new ContractViewport(mode), {});
  controller.setEffect({ value: 1 });
  controller.patch([{ path: "/value", value: cycle }]);
}
controller.dispose();
assert.equal(ContractViewport.order.filter((entry) => entry.endsWith(":mount")).length, 100);
assert.equal(ContractViewport.order.filter((entry) => entry.endsWith(":dispose")).length, 100);
for (let i = 1; i + 1 < ContractViewport.order.length; i += 2) {
  assert.match(ContractViewport.order[i], /:dispose$/);
  assert.match(ContractViewport.order[i + 1], /:mount$/);
}

const hudElement = { textContent: "" };
const hud = new StatsHUD(hudElement);
hud.update({ fps: 60, frameMs: 16.7, p95Ms: 18, drawCalls: 4, triangles: 20,
  particles: 10, particlesCap: 600, dpr: 1, renderScale: 1, tier: "low" }, 1000);
assert.match(hudElement.textContent, /60 FPS/);
assert.match(hudElement.textContent, /10\/600 particles/);

console.log("Viewport controller lifecycle and StatsHUD tests passed (100 cycles).");
