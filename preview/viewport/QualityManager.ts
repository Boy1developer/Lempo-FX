import type { Tier } from "./Viewport.js";

export type Quality = Tier | "auto";
export interface QualityProfile {
  maxDpr: number;
  particleCap: number;
  trailSegments: number;
}

const PROFILES: Record<Tier, QualityProfile> = {
  low: { maxDpr: 1, particleCap: 600, trailSegments: 8 },
  medium: { maxDpr: 1.5, particleCap: 1500, trailSegments: 16 },
  high: { maxDpr: 2, particleCap: 4000, trailSegments: 32 },
};

/** Shared quality policy; renderers consume the resulting profile and scale. */
export class QualityManager {
  private requested: Quality = "auto";
  private tier: Tier = "high";
  private renderScale = 1;
  private emaMs = 16.67;
  private slowMs = 0;
  private recoveryMs = 0;

  get currentTier(): Tier { return this.tier; }
  get scale(): number { return this.renderScale; }
  get profile(): QualityProfile { return PROFILES[this.tier]; }
  get dprCap(): number { return this.profile.maxDpr; }
  get particleCap(): number { return this.profile.particleCap; }
  get trailSegments(): number { return this.profile.trailSegments; }

  setQuality(quality: Quality): void {
    this.requested = quality;
    if (quality !== "auto") {
      this.tier = quality;
      this.renderScale = 1;
    }
  }

  /** Feed one frame duration. Auto mode lowers scale after sustained load. */
  recordFrame(frameMs: number, dtSeconds: number): boolean {
    if (!Number.isFinite(frameMs) || frameMs < 0) return false;
    this.emaMs += (frameMs - this.emaMs) * (2 / 31);
    if (this.requested !== "auto") return false;
    this.slowMs = this.emaMs > 20 ? this.slowMs + dtSeconds : 0;
    this.recoveryMs = this.emaMs < 13 ? this.recoveryMs + dtSeconds : 0;
    if (this.slowMs >= 1 && this.renderScale > 0.5) {
      this.renderScale = Math.max(0.5, this.renderScale - 0.15);
      this.slowMs = 0;
      this.recoveryMs = 0;
      return true;
    }
    if (this.recoveryMs >= 5 && this.renderScale < 1) {
      this.renderScale = Math.min(1, this.renderScale + 0.1);
      this.recoveryMs = 0;
      return true;
    }
    return false;
  }
}
