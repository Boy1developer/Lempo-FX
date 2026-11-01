import { ParticleEngine } from "../../../lempo-runtime/src/engine.js";
import { PixiScene } from "../../pixi_scene.js";
const FIXED_DT = 1 / 60;
/** PixiJS viewport adapter with cursor-anchored zoom and pan controls. */
export class PixiViewport {
    constructor(invalidate = () => { }) {
        this.invalidate = invalidate;
        this.engine = new ParticleEngine();
        this.listeners = {
            emitterMoved: new Set(), pick: new Set(), stats: new Set(), error: new Set(),
        };
        this.source = null;
        this.disposed = false;
        this.playing = true;
        this.tool = "select";
        this.emitterX = 0;
        this.emitterY = 0;
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1;
        this.quality = "low";
        this.view = { grid: true, guides: true, stats: true };
        this.pointerDown = false;
        this.panning = false;
        this.movingEmitter = false;
        this.spaceDown = false;
        this.lastX = 0;
        this.lastY = 0;
        this.onPointerDown = (event) => {
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
        this.onPointerMove = (event) => {
            if (!this.pointerDown)
                return;
            const dx = event.clientX - this.lastX, dy = event.clientY - this.lastY;
            this.lastX = event.clientX;
            this.lastY = event.clientY;
            if (this.panning) {
                this.panX += dx;
                this.panY += dy;
            }
            else if (this.movingEmitter) {
                const p = this.localPoint(event);
                this.emitterX = (p.x - this.panX) / this.zoom;
                this.emitterY = (p.y - this.panY) / this.zoom;
                this.emit("emitterMoved", { x: this.emitterX, y: this.emitterY });
            }
            this.invalidate();
        };
        this.onPointerUp = (event) => {
            this.pointerDown = false;
            this.panning = false;
            this.movingEmitter = false;
            if (this.canvas.hasPointerCapture(event.pointerId))
                this.canvas.releasePointerCapture(event.pointerId);
        };
        this.onWheel = (event) => {
            event.preventDefault();
            const p = this.localPoint(event);
            const worldX = (p.x - this.panX) / this.zoom;
            const worldY = (p.y - this.panY) / this.zoom;
            this.zoom = Math.max(0.2, Math.min(8, this.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
            this.panX = p.x - worldX * this.zoom;
            this.panY = p.y - worldY * this.zoom;
            this.invalidate();
        };
        this.onKeyDown = (event) => {
            if (event.code === "Space") {
                this.spaceDown = true;
                event.preventDefault();
            }
        };
        this.onKeyUp = (event) => { if (event.code === "Space")
            this.spaceDown = false; };
        this.onResize = () => { this.resize(); };
    }
    mount(host) {
        if (this.canvas)
            throw new Error("PixiViewport is already mounted");
        this.host = host;
        this.canvas = document.createElement("canvas");
        this.canvas.className = "lempo-viewport-pixi";
        this.canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
        host.appendChild(this.canvas);
        this.sceneAdapter = new PixiScene(this.canvas, this.engine);
        const maxDpr = this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2;
        void this.sceneAdapter.init({ maxDpr, antialias: this.quality === "high", dynamicTrails: true })
            .then(() => {
            if (this.disposed) {
                this.sceneAdapter.destroy();
                return;
            }
            this.applyView();
            this.resize();
            this.invalidate();
        })
            .catch((error) => this.emit("error", { message: errorMessage(error) }));
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
    setEffect(effect) {
        this.source = structuredClone(effect);
        this.engine.loadEffect(this.source);
        this.invalidate();
    }
    patch(ops) {
        if (!this.source)
            throw new Error("Cannot patch before setEffect");
        const next = structuredClone(this.source);
        for (const op of ops)
            applyJsonPointer(next, op.path, op.value);
        this.source = next;
        this.engine.loadEffect(this.source);
        this.invalidate();
    }
    play() { this.playing = true; }
    pause() { this.playing = false; }
    restart() {
        if (this.source)
            this.engine.loadEffect(this.source);
        this.invalidate();
    }
    seek(t) {
        if (!this.source)
            return;
        this.engine.loadEffect(this.source);
        const steps = Math.min(3600, Math.max(0, Math.floor(t / FIXED_DT)));
        for (let i = 0; i < steps; i++)
            this.engine.update(FIXED_DT, this.emitterX, this.emitterY);
        this.invalidate();
    }
    update(dt) {
        if (this.playing && this.source)
            this.engine.update(dt, this.emitterX, this.emitterY);
        if (this.sceneAdapter?.ready) {
            this.sceneAdapter.setTransform(this.panX, this.panY, this.zoom);
            this.sceneAdapter.sync(this.emitterX, this.emitterY);
        }
    }
    render() { this.sceneAdapter?.render(); }
    setTool(tool) { this.tool = tool; this.invalidate(); }
    setView(options) {
        this.view = { ...this.view, ...options };
        this.applyView();
        this.invalidate();
    }
    setQuality(quality) {
        this.quality = quality;
        const dpr = quality === "low" ? 1 : quality === "medium" ? 1.5 : 2;
        const cap = quality === "low" ? 600 : quality === "medium" ? 1500 : 4000;
        this.sceneAdapter?.setQuality(dpr, cap);
        this.resize();
    }
    resize(width, height, dpr = window.devicePixelRatio || 1) {
        if (!this.host || this.disposed)
            return;
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
    on(event, callback) {
        this.listeners[event].add(callback);
    }
    dispose() {
        if (this.disposed || !this.canvas)
            return;
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
    localPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    applyView() { this.sceneAdapter?.setView(this.view); }
    emit(event, payload) {
        for (const listener of this.listeners[event])
            listener(payload);
    }
}
function applyJsonPointer(root, pointer, value) {
    if (!pointer.startsWith("/"))
        throw new Error(`Invalid JSON Pointer: ${pointer}`);
    const parts = pointer.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
    let parent = root;
    for (const part of parts.slice(0, -1)) {
        if (!parent || typeof parent !== "object")
            throw new Error(`Missing path: ${pointer}`);
        parent = parent[part];
    }
    const last = parts[parts.length - 1];
    if (!last || !parent || typeof parent !== "object")
        throw new Error(`Invalid path: ${pointer}`);
    parent[last] = value;
}
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
