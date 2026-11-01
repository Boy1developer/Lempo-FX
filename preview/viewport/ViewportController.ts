import { QualityManager, type Quality } from "./QualityManager.js";
import type { EffectJSON, PatchOp, Tier, Tool, Viewport } from "./Viewport.js";

const MAX_DT = 1 / 20;
const FIXED_DT = 1 / 60;
const MAX_STEPS = 3;

export interface FrameContext { now: number; dt: number; }
export type FrameHandler = (context: FrameContext) => void;

/** Owns viewport selection and the only animation-frame scheduler. */
export class ViewportController {
  readonly quality = new QualityManager();
  private viewport: Viewport | null = null;
  private frameHandler: FrameHandler | null = null;
  private frameId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private dirty = true;
  private playing = false;
  private disposed = false;

  constructor(private readonly doc: Document = document) {
    doc.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  setFrameHandler(handler: FrameHandler): void { this.frameHandler = handler; }
  setContinuous(playing: boolean): void {
    this.playing = playing;
    if (playing) this.invalidate();
    else this.requestIfNeeded();
  }

  setViewport(viewport: Viewport, element: HTMLElement): void {
    this.viewport?.dispose();
    this.viewport = viewport;
    viewport.mount(element);
    this.invalidate();
  }

  setEffect(effect: EffectJSON): void { this.requireViewport().setEffect(effect); this.invalidate(); }
  patch(ops: PatchOp[]): void { this.requireViewport().patch(ops); this.invalidate(); }
  setTool(tool: Tool): void { this.requireViewport().setTool(tool); this.invalidate(); }
  setView(opts: { grid?: boolean; guides?: boolean; stats?: boolean }): void {
    this.requireViewport().setView(opts);
    this.invalidate();
  }
  setQuality(quality: Quality): void {
    this.quality.setQuality(quality);
    this.viewport?.setQuality(quality);
    this.invalidate();
  }
  resize(w: number, h: number, dpr: number): void {
    this.viewport?.resize(w, h, dpr);
    this.invalidate();
  }
  play(): void { this.playing = true; this.viewport?.play(); this.invalidate(); }
  pause(): void { this.playing = false; this.viewport?.pause(); this.requestIfNeeded(); }
  restart(): void { this.viewport?.restart(); this.invalidate(); }
  seek(t: number): void { this.viewport?.seek(t); this.invalidate(); }
  invalidate(): void { this.dirty = true; this.requestIfNeeded(); }

  dispose(): void {
    this.disposed = true;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.doc.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.viewport?.dispose();
    this.viewport = null;
  }

  private requireViewport(): Viewport {
    if (!this.viewport) throw new Error("No viewport has been mounted");
    return this.viewport;
  }

  private onVisibilityChange = (): void => {
    this.lastTime = 0;
    if (this.doc.visibilityState === "visible") this.invalidate();
    else if (this.frameId) { cancelAnimationFrame(this.frameId); this.frameId = 0; }
  };

  private requestIfNeeded(): void {
    if (this.disposed || this.doc.visibilityState === "hidden" || this.frameId) return;
    if (!this.playing && !this.dirty) return;
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  }

  private onAnimationFrame = (now: number): void => {
    this.frameId = 0;
    const elapsed = this.lastTime ? Math.min(MAX_DT, Math.max(0, (now - this.lastTime) / 1000)) : 0;
    this.lastTime = now;
    const frameStart = performance.now();
    if (this.frameHandler) {
      this.frameHandler({ now, dt: elapsed });
      this.dirty = false;
    } else if (this.viewport && (this.playing || this.dirty)) {
      if (this.playing) {
        this.accumulator = Math.min(this.accumulator + elapsed, FIXED_DT * MAX_STEPS);
        let steps = 0;
        while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
          this.viewport.update(FIXED_DT);
          this.accumulator -= FIXED_DT;
          steps++;
        }
      }
      this.viewport.render();
      this.dirty = false;
    }
    this.quality.recordFrame(performance.now() - frameStart, elapsed);
    this.requestIfNeeded();
  };
}
