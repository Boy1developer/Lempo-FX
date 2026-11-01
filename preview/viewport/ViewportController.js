import { QualityManager } from "./QualityManager.js";
import { ThreeViewport } from "./three/ThreeViewport.js";
import { PixiViewport } from "./pixi/PixiViewport.js";
const MAX_DT = 1 / 20;
const FIXED_DT = 1 / 60;
const MAX_STEPS = 3;
/** Owns viewport selection and the only animation-frame scheduler. */
export class ViewportController {
    constructor(doc = document) {
        this.doc = doc;
        this.quality = new QualityManager();
        this.viewport = null;
        this.mode = null;
        this.frameHandler = null;
        this.frameId = 0;
        this.lastTime = 0;
        this.accumulator = 0;
        this.dirty = true;
        this.playing = false;
        this.disposed = false;
        this.onVisibilityChange = () => {
            this.lastTime = 0;
            if (this.doc.visibilityState === "visible")
                this.invalidate();
            else if (this.frameId) {
                cancelAnimationFrame(this.frameId);
                this.frameId = 0;
            }
        };
        this.onAnimationFrame = (now) => {
            this.frameId = 0;
            const elapsed = this.lastTime ? Math.min(MAX_DT, Math.max(0, (now - this.lastTime) / 1000)) : 0;
            this.lastTime = now;
            const frameStart = performance.now();
            if (this.viewport && (this.playing || this.dirty)) {
                if (this.playing) {
                    this.accumulator = Math.min(this.accumulator + elapsed, FIXED_DT * MAX_STEPS);
                    let steps = 0;
                    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
                        this.viewport.update(FIXED_DT);
                        this.accumulator -= FIXED_DT;
                        steps++;
                    }
                }
                else if (this.dirty) {
                    // Let control animations (for example ViewHelper camera snaps) advance
                    // on invalidated frames while the particle simulation is paused.
                    this.viewport.update(elapsed);
                }
                this.viewport.render();
                this.dirty = false;
            }
            else if (this.frameHandler) {
                this.frameHandler({ now, dt: elapsed });
                this.dirty = false;
            }
            this.quality.recordFrame(performance.now() - frameStart, elapsed);
            this.requestIfNeeded();
        };
        doc.addEventListener("visibilitychange", this.onVisibilityChange);
    }
    setFrameHandler(handler) { this.frameHandler = handler; }
    setContinuous(playing) {
        this.playing = playing;
        if (playing)
            this.invalidate();
        else
            this.requestIfNeeded();
    }
    setViewport(viewport, element) {
        this.viewport?.dispose();
        this.viewport = viewport;
        viewport.mount(element);
        if (this.playing)
            viewport.play();
        else
            viewport.pause();
        this.invalidate();
    }
    setMode(mode, element) {
        if (this.mode === mode && this.viewport)
            return;
        const viewport = mode === "3d"
            ? new ThreeViewport(() => this.invalidate())
            : new PixiViewport(() => this.invalidate());
        this.setViewport(viewport, element);
        this.mode = mode;
        this.viewport?.setQuality(this.quality.currentTier);
    }
    setEffect(effect) { this.requireViewport().setEffect(effect); this.invalidate(); }
    patch(ops) { this.requireViewport().patch(ops); this.invalidate(); }
    setTool(tool) { this.requireViewport().setTool(tool); this.invalidate(); }
    setView(opts) {
        this.requireViewport().setView(opts);
        this.invalidate();
    }
    setQuality(quality) {
        this.quality.setQuality(quality);
        this.viewport?.setQuality(quality);
        this.invalidate();
    }
    resize(w, h, dpr) {
        this.viewport?.resize(w, h, dpr);
        this.invalidate();
    }
    play() { this.playing = true; this.viewport?.play(); this.invalidate(); }
    pause() { this.playing = false; this.viewport?.pause(); this.requestIfNeeded(); }
    restart() { this.viewport?.restart(); this.invalidate(); }
    seek(t) { this.viewport?.seek(t); this.invalidate(); }
    invalidate() { this.dirty = true; this.requestIfNeeded(); }
    dispose() {
        this.disposed = true;
        if (this.frameId)
            cancelAnimationFrame(this.frameId);
        this.frameId = 0;
        this.doc.removeEventListener("visibilitychange", this.onVisibilityChange);
        this.viewport?.dispose();
        this.viewport = null;
        this.mode = null;
    }
    requireViewport() {
        if (!this.viewport)
            throw new Error("No viewport has been mounted");
        return this.viewport;
    }
    requestIfNeeded() {
        if (this.disposed || this.doc.visibilityState === "hidden" || this.frameId)
            return;
        if (!this.playing && !this.dirty)
            return;
        this.frameId = requestAnimationFrame(this.onAnimationFrame);
    }
}
