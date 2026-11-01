import type { ViewportStats } from "./Viewport.js";

/** Updates a lightweight DOM HUD no more than once per second. */
export class StatsHUD {
  private lastUpdate = 0;

  constructor(private readonly element: HTMLElement) {}

  update(stats: ViewportStats, nowMs: number): void {
    if (nowMs - this.lastUpdate < 1000) return;
    this.lastUpdate = nowMs;
    const cap = stats.particlesCap == null ? "∞" : String(stats.particlesCap);
    this.element.textContent =
      `${Math.round(stats.fps)} FPS · ${stats.frameMs.toFixed(1)} ms · ` +
      `${stats.particles}/${cap} particles · ${stats.drawCalls} calls · ` +
      `${stats.tier} · ${stats.renderScale.toFixed(2)}×`;
  }
}
