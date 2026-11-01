import type { Viewport, ViewportStats } from "./Viewport.js";

/** Updates a lightweight DOM HUD no more than once per second. */
export class StatsHUD {
  private lastUpdate = 0;

  constructor(private readonly element: HTMLElement) {}

  bind(viewport: Viewport): () => void {
    return viewport.on("stats", (stats) => this.update(stats, performance.now()));
  }

  update(stats: ViewportStats, nowMs: number): void {
    if (this.lastUpdate && nowMs - this.lastUpdate < 1000) return;
    this.lastUpdate = nowMs;
    const cap = stats.particlesCap == null ? "∞" : String(stats.particlesCap);
    this.element.textContent =
      `${Math.round(stats.fps)} FPS · ${stats.frameMs.toFixed(1)} ms · ` +
      `${stats.particles}/${cap} particles · ${stats.drawCalls} calls · ` +
      `${stats.tier} · ${stats.renderScale.toFixed(2)}×`;
  }
}
