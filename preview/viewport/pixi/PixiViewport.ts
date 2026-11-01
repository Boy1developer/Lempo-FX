import * as PIXI from "pixi.js";
import { ParticleEngine } from "../../../lempo-runtime/src/engine.js";
import type { Quality } from "../QualityManager.js";
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
  private view = { grid: true, guides: true, stats: true };
  private pointerDown = false;
  private panning = false;
  private movingEmitter = false;
  private spaceDown = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private readonly invalidate: () => void = () => {}) {}

  mount(host: HTMLElement): void {
    if (this.canvas) throw new Error("PixiViewport is already mounted");
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "lempo-viewport-pixi";
    this.canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
    host.appendChild(this.canvas);
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
    if (this.sceneAdapter?.ready) {
      this.sceneAdapter.setTransform(this.panX, this.panY, this.zoom);
      this.sceneAdapter.sync(this.emitterX, this.emitterY);
    }
  }

  render(): void { this.sceneAdapter?.render(); }

  setTool(tool: Tool): void { this.tool = tool; this.invalidate(); }

  setView(options: { grid?: boolean; guides?: boolean; stats?: boolean }): void {
    this.view = { ...this.view, ...options };
    this.applyView();
    this.invalidate();
  }

  setQuality(quality: Tier | "auto"): void {
    this.quality = quality;
    const dpr = quality === "low" ? 1 : quality === "medium" ? 1.5 : 2;
    const cap = quality === "low" ? 600 : quality === "medium" ? 1500 : 4000;
    this.sceneAdapter?.setQuality(dpr, cap);
    this.resize();
  }

  resize(width?: number, height?: number, dpr = window.devicePixelRatio || 1): void {
    if (!this.host || this.disposed) return;
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(width ?? rect.width));
    const h = Math.max(1, Math.floor(height ?? rect.height));
    if (this.sceneAdapter?.ready) {
      const cap = this.quality === "low" ? 600 : this.quality === "medium" ? 1500 : 4000;
      this.sceneAdapter.setQuality(Math.min(dpr, this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2), cap);
      this.sceneAdapter.resize(w, h, dpr);
      this.sceneAdapter.sync(this.emitterX, this.emitterY);
    }
    if (this.emitterX === 0 && this.emitterY === 0) {
      this.emitterX = w / 2;
      this.emitterY = h * 0.52;
    }
    this.invalidate();
  }

  on<E extends ViewportEvent>(event: E, callback: (payload: ViewportEventPayload[E]) => void): void {
    this.listeners[event].add(callback as (payload: unknown) => void);
  }

  dispose(): void {
    if (this.disposed || !this.canvas) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.host.removeEventListener("keydown", this.onKeyDown);
    this.host.removeEventListener("keyup", this.onKeyUp);
    this.sceneAdapter.destroy();
    this.canvas.remove();
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
