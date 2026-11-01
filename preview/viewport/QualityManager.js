const PROFILES = {
    low: { maxDpr: 1, particleCap: 600, trailSegments: 8 },
    medium: { maxDpr: 1.5, particleCap: 1500, trailSegments: 16 },
    high: { maxDpr: 2, particleCap: 4000, trailSegments: 32 },
};
/** Shared quality policy; renderers consume the resulting profile and scale. */
export class QualityManager {
    constructor() {
        this.requested = "auto";
        this.tier = "high";
        this.renderScale = 1;
        this.emaMs = 16.67;
        this.slowMs = 0;
        this.recoveryMs = 0;
    }
    get currentTier() { return this.tier; }
    get scale() { return this.renderScale; }
    get profile() { return PROFILES[this.tier]; }
    get dprCap() { return this.profile.maxDpr; }
    get particleCap() { return this.profile.particleCap; }
    get trailSegments() { return this.profile.trailSegments; }
    setQuality(quality) {
        this.requested = quality;
        if (quality !== "auto") {
            this.tier = quality;
            this.renderScale = 1;
        }
    }
    /** Feed one frame duration. Auto mode lowers scale after sustained load. */
    recordFrame(frameMs, dtSeconds) {
        if (!Number.isFinite(frameMs) || frameMs < 0)
            return false;
        this.emaMs += (frameMs - this.emaMs) * (2 / 31);
        if (this.requested !== "auto")
            return false;
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
