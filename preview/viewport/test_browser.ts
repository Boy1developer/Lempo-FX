import { ViewportController } from "./ViewportController.js";
import type { EffectJSON, Viewport } from "./Viewport.js";
import * as THREE from "three";
import { ParticleEngine } from "../../lempo-runtime/src/engine.js";
import { ThreeScene } from "../three_scene.js";

const host = document.querySelector<HTMLElement>("#host")!;
const output = document.querySelector<HTMLElement>("#result")!;
const warnings: string[] = [];
const errors: string[] = [];
const originalWarn = console.warn;
const originalError = console.error;
window.addEventListener("error", (event) => errors.push(event.message));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
console.warn = (...args: unknown[]): void => {
  if (String(args[0]).includes("[Lempo viewport]")) warnings.push(String(args[0]));
  originalWarn(...args);
};
console.error = (...args: unknown[]): void => { errors.push(args.map(String).join(" ")); originalError(...args); };

async function main(): Promise<void> {
  // The query override is useful for short local diagnostics; normal acceptance runs all 100 cycles.
  const cycles = Number(new URLSearchParams(location.search).get("cycles") ?? 100);
  const trailEffects = await Promise.all([
    fetch("../../presets/trail_comet_2d.json", { cache: "no-store" }).then((r) => r.json() as Promise<EffectJSON>),
    fetch("../../presets/trail_smoke_ribbon_3d.json", { cache: "no-store" }).then((r) => r.json() as Promise<EffectJSON>),
  ]);
  let threeCycles = 0, pixiCycles = 0, childLeaks = 0, hudLeaks = 0, releaseLeaks = 0;
  let threeTrailFrames = 0, pixiTrailFrames = 0, threeAlphaSamples = 0, memoryGrowth = 0;
  let threeMemoryBase: { geometries: number; textures: number } | null = null;
  const postDisposeMax = { geometries: 0, textures: 0 };
  const controller = new ViewportController();
  let previous: DisposalRecord | null = null;

  for (let cycle = 0; cycle < cycles; cycle++) {
    const threeMode = cycle % 2 === 0;
    const mode = threeMode ? "3d" : "2d";
    controller.setMode(mode, host);
    if (previous) {
      const memory = previous.renderer?.info.memory;
      if (memory) {
        postDisposeMax.geometries = Math.max(postDisposeMax.geometries, memory.geometries);
        postDisposeMax.textures = Math.max(postDisposeMax.textures, memory.textures);
      }
      if (!isDisposed(previous) || (memory && (memory.geometries > 1 || memory.textures > 1))) releaseLeaks++;
      previous = null;
    }
    const viewport = (controller as unknown as { viewport: Viewport }).viewport;
    const effect = structuredClone(trailEffects[threeMode ? 1 : 0]);
    effect.type = mode;
    const trails = (effect.emitter as unknown as { trails?: { hideParticle?: boolean } }).trails;
    if (trails) trails.hideParticle = false;
    effect.emitter.blendingMode = threeMode ? "Overlay" : "Lighten";
    if (!threeMode) await waitFor(() => Boolean((viewport as unknown as { sceneAdapter?: { ready: boolean } }).sceneAdapter?.ready));
    controller.setEffect(effect);
    controller.patch([{ path: "/emitter/flow", value: 42 + cycle % 7 }]);
    controller.setView({ grid: cycle % 2 === 0, guides: true, stats: true });
    if (host.querySelectorAll(".lempo-viewport-stats").length !== 1) hudLeaks++;
    controller.setView({ stats: false });
    const hud = host.querySelector<HTMLElement>(".lempo-viewport-stats");
    if (!hud?.hidden) hudLeaks++;
    controller.setView({ stats: true });
    controller.setTool("move");
    viewport.play();
    for (let frame = 0; frame < (cycle < 2 ? 60 : 3); frame++) {
      viewport.update(1 / 60);
      viewport.render();
    }
    if (host.querySelectorAll("canvas").length !== 1) childLeaks++;

    if (threeMode) {
      const three = viewport as unknown as {
        renderer: { info: { memory: { geometries: number; textures: number } } };
        sceneAdapter: { meshes: Array<{ geometry: { getAttribute(name: string): { array: ArrayLike<number> } | undefined } } | null>;
          modelCache: Map<unknown, unknown>; ribbons: Array<{ visible: boolean }> };
      };
      const current = three.renderer.info.memory;
      if (cycle >= 2 && !threeMemoryBase) threeMemoryBase = { ...current };
      if (threeMemoryBase) memoryGrowth = Math.max(memoryGrowth,
        Math.abs(current.geometries - threeMemoryBase.geometries), Math.abs(current.textures - threeMemoryBase.textures));
      if (three.sceneAdapter.ribbons.some((ribbon) => ribbon.visible)) threeTrailFrames++;
      if (three.sceneAdapter.meshes.some((mesh) => {
        const alpha = mesh?.geometry.getAttribute("instanceAlpha")?.array;
        return alpha ? Array.from(alpha).some((value) => value > 0 && value < 1) : false;
      })) threeAlphaSamples++;
      previous = { mode, viewport, scene: three.sceneAdapter, renderer: three.renderer };
      threeCycles++;
    } else {
      const pixi = viewport as unknown as { sceneAdapter: PixiSceneResources };
      if (pixi.sceneAdapter.trailMeshes.some((mesh) => mesh.alpha > 0)) pixiTrailFrames++;
      previous = { mode, viewport, scene: pixi.sceneAdapter };
      pixiCycles++;
    }
  }
  controller.dispose();
  if (previous) {
    const memory = previous.renderer?.info.memory;
    if (memory) {
      postDisposeMax.geometries = Math.max(postDisposeMax.geometries, memory.geometries);
      postDisposeMax.textures = Math.max(postDisposeMax.textures, memory.textures);
    }
    if (!isDisposed(previous) || (memory && (memory.geometries > 1 || memory.textures > 1))) releaseLeaks++;
  }
  if (host.querySelectorAll("canvas").length !== 0) childLeaks++;
  if (host.querySelectorAll(".lempo-viewport-stats").length !== 0) hudLeaks++;

  const classicWarningStart = warnings.filter((x) => x.includes("pooled classic mesh path")).length;
  const classicCanvas = document.createElement("canvas");
  classicCanvas.style.cssText = "width:320px;height:240px";
  host.appendChild(classicCanvas);
  const classicEngine = new ParticleEngine();
  const classicEffect = structuredClone(trailEffects[1]);
  classicEffect.type = "3d";
  const classicTrails = (classicEffect.emitter as unknown as { trails?: { hideParticle?: boolean } }).trails;
  if (classicTrails) classicTrails.hideParticle = false;
  classicEngine.loadEffect(classicEffect);
  for (let i = 0; i < 30; i++) classicEngine.update(1 / 60, 0, 0);
  const classicScene = new ThreeScene(classicCanvas, classicEngine, {
    antialias: false, alpha: false, maxDpr: 1, shadows: false,
    toneMapping: THREE.NoToneMapping, forceClassicPath: true,
  });
  classicScene.render();
  const pools = (classicScene as unknown as { classicPools: Array<Array<{ visible: boolean }>> }).classicPools;
  const classicFallbackParticles = pools.reduce((sum, pool) => sum + pool.filter((mesh) => mesh.visible).length, 0);
  classicScene.dispose();
  classicCanvas.remove();
  const classicFallbackWarning = warnings.filter((x) => x.includes("pooled classic mesh path")).length - classicWarningStart;
  if (!classicFallbackParticles || classicFallbackWarning !== 1) releaseLeaks++;

  const overlayWarnings = warnings.filter((x) => x.includes("Three.js Overlay")).length;
  const lightenWarnings = warnings.filter((x) => x.includes("PixiJS Lighten")).length;
  if (threeCycles !== Math.ceil(cycles / 2) || pixiCycles !== Math.floor(cycles / 2) || childLeaks || hudLeaks || releaseLeaks ||
      memoryGrowth > 2 || (cycles >= 2 && (!threeTrailFrames || !pixiTrailFrames || !threeAlphaSamples)) ||
      overlayWarnings !== 1 || lightenWarnings !== 1 || errors.length) {
    throw new Error(JSON.stringify({ cycles, threeCycles, pixiCycles, childLeaks, hudLeaks, releaseLeaks, memoryGrowth,
      postDisposeMax, threeTrailFrames, pixiTrailFrames, threeAlphaSamples, classicFallbackParticles,
      classicFallbackWarning, overlayWarnings, lightenWarnings, errors }));
  }
  output.textContent = JSON.stringify({ result: "PASS", cycles, threeCycles, pixiCycles, childLeaks, hudLeaks, releaseLeaks,
    rendererMemoryDrift: memoryGrowth, postDisposeMax, threeTrailFrames, pixiTrailFrames, threeAlphaSamples,
    classicFallbackParticles, classicFallbackWarning,
    overlayWarnings, lightenWarnings, browserErrors: errors.length, webgl: !!document.createElement("canvas").getContext("webgl2") }, null, 2);
}

interface PixiSceneResources {
  ready: boolean; particleBuckets: Map<unknown, unknown>; particlesByShape: Map<unknown, unknown>;
  trailMeshes: Array<{ alpha: number }>; customTex: Map<unknown, unknown>; tex: Record<string, unknown>;
}
interface DisposalRecord {
  mode: "2d" | "3d"; viewport: Viewport; scene: unknown;
  renderer?: { info: { memory: { geometries: number; textures: number } } };
}

function isDisposed(record: DisposalRecord): boolean {
  const viewport = record.viewport as unknown as {
    canvas: HTMLCanvasElement | null; sceneAdapter: unknown; statsElement: HTMLDivElement | null;
  };
  if (viewport.canvas !== null || viewport.sceneAdapter !== null || viewport.statsElement !== null) return false;
  if (record.mode === "3d") {
    const scene = record.scene as { meshes: unknown[]; modelCache: Map<unknown, unknown>; ribbons: unknown[] };
    return scene.meshes.length === 0 && scene.modelCache.size === 0 && scene.ribbons.length === 0;
  }
  const scene = record.scene as PixiSceneResources;
  return !scene.ready && scene.particleBuckets.size === 0 && scene.particlesByShape.size === 0 &&
    scene.trailMeshes.length === 0 && scene.customTex.size === 0 && Object.keys(scene.tex).length === 0;
}

function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (predicate()) { resolve(); return; }
      if (performance.now() - start > timeoutMs) { reject(new Error("Pixi initialization timed out")); return; }
      window.setTimeout(poll, 20);
    };
    poll();
  });
}

void main().catch((error: unknown) => {
  output.textContent = `FAIL\n${error instanceof Error ? error.stack : String(error)}`;
  console.error(error);
});
