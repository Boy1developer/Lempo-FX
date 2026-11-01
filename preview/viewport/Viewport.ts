import type { LempoEffect } from "../../lempo-runtime/src/index.js";

export type Mode = "2d" | "3d";
export type Tool = "select" | "move" | "zone";
export type Tier = "low" | "medium" | "high";
export type EffectJSON = LempoEffect;

export interface ViewportStats {
  fps: number;
  frameMs: number;
  p95Ms: number;
  drawCalls: number;
  triangles: number;
  particles: number;
  particlesCap: number | null;
  dpr: number;
  renderScale: number;
  tier: Tier;
}

export type PatchOp = { path: string; value: unknown };
export type ViewportEvent = "emitterMoved" | "pick" | "stats" | "error";
export type ViewportEventPayload = {
  emitterMoved: { x: number; y: number; z?: number };
  pick: { id: string | null };
  stats: ViewportStats;
  error: { message: string };
};

export interface Viewport {
  mount(el: HTMLElement): void;
  dispose(): void;
  setEffect(effect: EffectJSON): void;
  patch(ops: PatchOp[]): void;
  play(): void;
  pause(): void;
  restart(): void;
  seek(t: number): void;
  update(dt: number): void;
  render(): void;
  setTool(tool: Tool): void;
  setView(opts: { grid?: boolean; guides?: boolean; stats?: boolean }): void;
  setQuality(quality: Tier | "auto"): void;
  setRenderScale(scale: number): void;
  resize(w: number, h: number, dpr: number): void;
  on<E extends ViewportEvent>(event: E, callback: (payload: ViewportEventPayload[E]) => void): () => void;
}
