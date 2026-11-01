import * as PIXI from "pixi.js";
import { ParticleEngine } from "../../../lempo-runtime/src/engine.js";
import type { Quality } from "../QualityManager.js";
import { StatsHUD } from "../StatsHUD.js";
import type {
  EffectJSON, PatchOp, Tier, Tool, Viewport, ViewportEvent,
  ViewportEventPayload,
} from "../Viewport.js";
import { PixiScene } from "../../pixi_scene.js";

const FIXED_DT = 1 / 60;

/** PixiJS viewport adapter with cursor-anchored zoom and pan controls. */
export class PixiViewport implements Viewport {
  readonly engine = new ParticleEngine();
  sceneAdapter!: PixiScene;
  private host!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private statsElement!: HTMLDivElement;
  private unbindStats: (() => void) | null = null;
  private resizeObserver!: ResizeObserver;
  private listeners: Record<ViewportEvent, Set<(payload: unknown) => void>> = {
    emitterMoved: new Set(), pick: new Set(), stats: new Set(), error: new Set(),
  };
  private source: EffectJSON | null = null;
  private disposed = false;
  private playing = true;
  private tool: Tool = "select";
  private emitterX = 0;
  private emitterY = 0;
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private quality: Quality = "low";
  private renderScale = 1;
  private statsAt = 0;
  private statsFrames = 0;
  private statsFrameTotal = 0;
  private frameSamples = new Float32Array(120);
  private frameSampleCount = 0;
  private frameSampleIndex = 0;
  private view = { grid: true, guides: true, stats: true };
  private pointerDown = false;
  private panning = false;
  private movingEmitter = false;
  private spaceDown = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly invalidate: () => void = () => {},
    private readonly setInteractionActive: (active: boolean) => void = () => {},
  ) {}

  mount(host: HTMLElement): void {
    if (this.canvas) throw new Error("PixiViewport is already mounted");
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "lempo-viewport-pixi";
    this.canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
    host.appendChild(this.canvas);
    this.statsElement = document.createElement("div");
    this.statsElement.className = "lempo-viewport-stats";
    this.statsElement.style.cssText = "position:fixed;right:12px;top:12px;z-index:1000;padding:5px 8px;border-radius:4px;background:#101218cc;color:#e8edf5;font:11px ui-monospace,monospace;pointer-events:none;white-space:nowrap";
    this.statsElement.hidden = !this.view.stats;
    host.appendChild(this.statsElement);
    this.unbindStats = new StatsHUD(this.statsElement).bind(this);
    this.sceneAdapter = new PixiScene(this.canvas, this.engine);
    const maxDpr = this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2;
    void this.sceneAdapter.init({ maxDpr, antialias: this.quality === "high", dynamicTrails: true })
      .then(() => {
        if (this.disposed) { this.sceneAdapter.destroy(); return; }
        this.applyView(); this.resize(); this.invalidate();
      })
      .catch((error: unknown) => this.emit("error", { message: errorMessage(error) }));
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.host.addEventListener("keydown", this.onKeyDown);
    this.host.addEventListener("keyup", this.onKeyUp);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(host);
    this.resize();
  }

  setEffect(effect: EffectJSON): void {
    this.source = structuredClone(effect);
    this.engine.loadEffect(this.source);
    this.invalidate();
  }

  patch(ops: PatchOp[]): void {
    if (!this.source) throw new Error("Cannot patch before setEffect");
    const next = structuredClone(this.source) as unknown as Record<string, unknown>;
    for (const op of ops) applyJsonPointer(next, op.path, op.value);
    this.source = next as unknown as EffectJSON;
    this.engine.loadEffect(this.source);
    this.invalidate();
  }

  play(): void { this.playing = true; }
  pause(): void { this.playing = false; }
  restart(): void {
    if (this.source) this.engine.loadEffect(this.source);
    this.invalidate();
  }
  seek(t: number): void {
    if (!this.source) return;
    this.engine.loadEffect(this.source);
    const steps = Math.min(3600, Math.max(0, Math.floor(t / FIXED_DT)));
    for (let i = 0; i < steps; i++) this.engine.update(FIXED_DT, this.emitterX, this.emitterY);
    this.invalidate();
  }

  update(dt: number): void {
    if (this.playing && this.source) this.engine.update(dt, this.emitterX, this.emitterY);
    if (this.source && this.sceneAdapter?.ready) {
      this.sceneAdapter.setTransform(this.panX, this.panY, this.zoom);
      this.sceneAdapter.sync(this.emitterX, this.emitterY);
    }
  }

  render(): void {
    if (!this.sceneAdapter?.ready) return;
    const start = performance.now();
    this.sceneAdapter.render();
    this.reportStats(performance.now() - start);
  }

  setTool(tool: Tool): void { this.tool = tool; this.invalidate(); }

  setView(options: { grid?: boolean; guides?: boolean; stats?: boolean }): void {
    this.view = { ...this.view, ...options };
    this.statsElement.hidden = !this.view.stats;
    this.applyView();
    this.invalidate();
  }

  setQuality(quality: Tier | "auto"): void {
    this.quality = quality;
    const dpr = quality === "low" ? 1 : quality === "medium" ? 1.5 : 2;
    const cap = quality === "low" ? 600 : quality === "medium" ? 1500 : 4000;
    this.sceneAdapter?.setQuality(dpr, cap, this.renderScale);
    this.resize();
  }

  setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.5, Math.min(1, scale));
    const dpr = this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2;
    const cap = this.quality === "low" ? 600 : this.quality === "medium" ? 1500 : 4000;
    this.sceneAdapter?.setQuality(dpr, cap, this.renderScale);
    this.resize();
  }

  resize(width?: number, height?: number, dpr = window.devicePixelRatio || 1): void {
    if (!this.host || this.disposed) return;
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(width ?? rect.width));
    const h = Math.max(1, Math.floor(height ?? rect.height));
    if (this.sceneAdapter?.ready) {
      const cap = this.quality === "low" ? 600 : this.quality === "medium" ? 1500 : 4000;
      this.sceneAdapter.setQuality(Math.min(dpr, this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2), cap, this.renderScale);
      this.sceneAdapter.resize(w, h, dpr);
      if (this.source) this.sceneAdapter.sync(this.emitterX, this.emitterY);
    }
    if (this.emitterX === 0 && this.emitterY === 0) {
      this.emitterX = w / 2;
      this.emitterY = h * 0.52;
    }
    this.invalidate();
  }

  on<E extends ViewportEvent>(event: E, callback: (payload: ViewportEventPayload[E]) => void): () => void {
    this.listeners[event].add(callback as (payload: unknown) => void);
    return () => { this.listeners[event].delete(callback as (payload: unknown) => void); };
  }

  private reportStats(frameMs: number): void {
    if (!this.view.stats) return;
    const now = performance.now();
    this.statsFrames++;
    this.statsFrameTotal += frameMs;
    this.frameSamples[this.frameSampleIndex] = frameMs;
    this.frameSampleIndex = (this.frameSampleIndex + 1) % this.frameSamples.length;
    this.frameSampleCount = Math.min(this.frameSampleCount + 1, this.frameSamples.length);
    if (!this.statsAt) { this.statsAt = now; return; }
    const elapsed = now - this.statsAt;
    if (elapsed < 1000) return;
    const sorted: number[] = [];
    for (let i = 0; i < this.frameSampleCount; i++) sorted.push(this.frameSamples[i]);
    sorted.sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
    const tier = this.quality === "auto" ? "high" : this.quality;
    const particles = this.engine.activeCount;
    this.emit("stats", {
      fps: this.statsFrames * 1000 / elapsed,
      frameMs: this.statsFrameTotal / this.statsFrames,
      p95Ms: p95,
      drawCalls: this.sceneAdapter.lastDrawCalls,
      triangles: particles * 2 + this.sceneAdapter.activeTrailMeshCount * 32,
      particles,
      particlesCap: tier === "low" ? 600 : tier === "medium" ? 1500 : 4000,
      dpr: this.sceneAdapter.resolution, renderScale: this.renderScale, tier,
    });
    this.statsAt = now; this.statsFrames = 0; this.statsFrameTotal = 0;
  }

  dispose(): void {
    if (this.disposed || !this.canvas) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.unbindStats?.();
    this.unbindStats = null;
    this.statsElement.remove();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.host.removeEventListener("keydown", this.onKeyDown);
    this.host.removeEventListener("keyup", this.onKeyUp);
    this.sceneAdapter.destroy();
    this.canvas.remove();
    this.listeners.emitterMoved.clear();
    this.listeners.pick.clear();
    this.listeners.stats.clear();
    this.listeners.error.clear();
    this.source = null;
    this.host = null as unknown as HTMLElement;
    this.canvas = null as unknown as HTMLCanvasElement;
    this.statsElement = null as unknown as HTMLDivElement;
    this.sceneAdapter = null as unknown as PixiScene;
  }

  private localPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onPointerDown = (event: PointerEvent): void => {
    const p = this.localPoint(event);
    this.pointerDown = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.panning = event.button === 1 || (event.button === 0 && this.spaceDown);
    const sx = this.panX + this.emitterX * this.zoom;
    const sy = this.panY + this.emitterY * this.zoom;
    this.movingEmitter = !this.panning && this.tool === "move" && Math.hypot(p.x - sx, p.y - sy) <= 32;
    if (this.panning || this.movingEmitter) {
      this.setInteractionActive(true);
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerDown) return;
    const dx = event.clientX - this.lastX, dy = event.clientY - this.lastY;
    this.lastX = event.clientX; this.lastY = event.clientY;
    if (this.panning) {
      this.panX += dx; this.panY += dy;
    } else if (this.movingEmitter) {
      const p = this.localPoint(event);
      this.emitterX = (p.x - this.panX) / this.zoom;
      this.emitterY = (p.y - this.panY) / this.zoom;
      this.emit("emitterMoved", { x: this.emitterX, y: this.emitterY });
    }
    this.invalidate();
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.pointerDown = false;
    this.panning = false;
    this.movingEmitter = false;
    this.setInteractionActive(false);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const p = this.localPoint(event);
    const worldX = (p.x - this.panX) / this.zoom;
    const worldY = (p.y - this.panY) / this.zoom;
    this.zoom = Math.max(0.2, Math.min(8, this.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
    this.panX = p.x - worldX * this.zoom;
    this.panY = p.y - worldY * this.zoom;
    this.invalidate();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Space") { this.spaceDown = true; event.preventDefault(); }
  };
  private onKeyUp = (event: KeyboardEvent): void => { if (event.code === "Space") this.spaceDown = false; };
  private onResize = (): void => { this.resize(); };
  private applyView(): void { this.sceneAdapter?.setView(this.view); }

  private emit<E extends ViewportEvent>(event: E, payload: ViewportEventPayload[E]): void {
    for (const listener of this.listeners[event]) listener(payload);
  }
}

function applyJsonPointer(root: Record<string, unknown>, pointer: string, value: unknown): void {
  if (!pointer.startsWith("/")) throw new Error(`Invalid JSON Pointer: ${pointer}`);
  const parts = pointer.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let parent: unknown = root;
  for (const part of parts.slice(0, -1)) {
    if (!parent || typeof parent !== "object") throw new Error(`Missing path: ${pointer}`);
    parent = (parent as Record<string, unknown>)[part];
  }
  const last = parts[parts.length - 1];
  if (!last || !parent || typeof parent !== "object") throw new Error(`Invalid path: ${pointer}`);
  (parent as Record<string, unknown>)[last] = value;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
