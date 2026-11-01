const PROFILES = {
    low: { maxDpr: 1, particleCap: 600, trailSegments: 8 },
    medium: { maxDpr: 1.5, particleCap: 1500, trailSegments: 16 },
    high: { maxDpr: 2, particleCap: 4000, trailSegments: 32 },
};
/** Shared quality policy; renderers consume the resulting profile and scale. */
export class QualityManager {
    constructor(storage) {
        this.requested = "auto";
        this.tier = "high";
        this.renderScale = 1;
        this.emaMs = 16.67;
        this.slowMs = 0;
        this.recoveryMs = 0;
        this.frameSamples = new Float32Array(120);
        this.frameSampleCount = 0;
        this.frameSampleIndex = 0;
        if (storage !== undefined)
            this.storage = storage;
        else {
            try {
                this.storage = typeof localStorage === "undefined" ? null : localStorage;
            }
            catch {
                this.storage = null;
            }
        }
        try {
            const saved = this.storage?.getItem("lempo.viewport.quality");
            if (saved === "auto" || saved === "low" || saved === "medium" || saved === "high") {
                this.requested = saved;
                if (saved !== "auto")
                    this.tier = saved;
            }
        }
        catch { /* Storage may be blocked by browser privacy settings. */ }
    }
    get currentTier() { return this.tier; }
    get scale() { return this.renderScale; }
    get profile() { return PROFILES[this.tier]; }
    get dprCap() { return this.profile.maxDpr; }
    get particleCap() { return this.profile.particleCap; }
    get trailSegments() { return this.profile.trailSegments; }
    get p95FrameMs() {
        if (!this.frameSampleCount)
            return 0;
        const sorted = [];
        for (let i = 0; i < this.frameSampleCount; i++)
            sorted.push(this.frameSamples[i]);
        sorted.sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
    }
    setQuality(quality) {
        this.requested = quality;
        try {
            this.storage?.setItem("lempo.viewport.quality", quality);
        }
        catch { /* Quality still applies when persistence is unavailable. */ }
        if (quality !== "auto") {
            this.tier = quality;
            this.renderScale = 1;
            this.slowMs = 0;
            this.recoveryMs = 0;
        }
    }
    /** Feed one frame duration. Auto mode follows the sustained-load thresholds in the migration plan. */
    recordFrame(frameMs, dtSeconds) {
        if (!Number.isFinite(frameMs) || frameMs < 0)
            return false;
        this.emaMs += (frameMs - this.emaMs) * (2 / 31);
        this.frameSamples[this.frameSampleIndex] = frameMs;
        this.frameSampleIndex = (this.frameSampleIndex + 1) % this.frameSamples.length;
        this.frameSampleCount = Math.min(this.frameSampleCount + 1, this.frameSamples.length);
        if (this.requested !== "auto")
            return false;
        this.slowMs = this.emaMs > 20 ? this.slowMs + dtSeconds : 0;
        this.recoveryMs = this.emaMs < 12 ? this.recoveryMs + dtSeconds : 0;
        if (this.slowMs >= 1 && this.renderScale > 0.5) {
            this.renderScale = Math.max(0.5, this.renderScale - 0.15);
            this.slowMs = 0;
            this.recoveryMs = 0;
            return true;
        }
        if (this.slowMs >= 3 && this.renderScale <= 0.5 && this.tier !== "low") {
            this.tier = this.tier === "high" ? "medium" : "low";
            this.renderScale = 1;
            this.slowMs = 0;
            this.recoveryMs = 0;
            return true;
        }
        if (this.recoveryMs >= 3 && this.renderScale < 1) {
            this.renderScale = Math.min(1, this.renderScale + 0.05);
            this.recoveryMs = 0;
            return true;
        }
        return false;
    }
}
