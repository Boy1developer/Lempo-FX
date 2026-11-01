import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { ViewHelper } from "three/addons/helpers/ViewHelper.js";
import { ParticleEngine } from "../../../lempo-runtime/src/engine.js";
import { StatsHUD } from "../StatsHUD.js";
import { ThreeScene } from "../../three_scene.js";
const FIXED_DT = 1 / 60;
/** Three.js viewport adapter; owns controls while ThreeScene owns particle rendering. */
export class ThreeViewport {
    constructor(invalidate = () => { }, setInteractionActive = () => { }) {
        this.invalidate = invalidate;
        this.setInteractionActive = setInteractionActive;
        this.engine = new ParticleEngine();
        this.unbindStats = null;
        this.emitter = new THREE.Object3D();
        this.emitterAxes = new THREE.AxesHelper(30);
        this.listeners = {
            emitterMoved: new Set(), pick: new Set(), stats: new Set(), error: new Set(),
        };
        this.source = null;
        this.disposed = false;
        this.playing = true;
        this.gizmoDragging = false;
        this.helperDirty = true;
        this.quality = "low";
        this.renderScale = 1;
        this.statsAt = 0;
        this.statsFrames = 0;
        this.statsFrameTotal = 0;
        this.frameSamples = new Float32Array(120);
        this.frameSampleCount = 0;
        this.frameSampleIndex = 0;
        this.visible = { grid: true, guides: true, stats: true };
        this.onCameraChange = () => {
            this.helperDirty = true;
            this.invalidate();
        };
        this.onDraggingChanged = (event) => {
            this.gizmoDragging = Boolean(event.value);
            this.setInteractionActive(this.gizmoDragging);
            this.controls.enabled = !this.gizmoDragging;
        };
        this.onEmitterChanged = () => {
            if (!this.gizmoDragging)
                return;
            const { x, y, z } = this.emitter.position;
            this.emit("emitterMoved", { x, y, z });
            this.invalidate();
        };
        this.onViewHelperPointerDown = (event) => {
            if (!this.viewHelper.handleClick(event))
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.helperDirty = true;
            this.invalidate();
        };
        this.onResize = () => { this.resize(); };
    }
    mount(host) {
        if (this.canvas)
            throw new Error("ThreeViewport is already mounted");
        this.host = host;
        this.canvas = document.createElement("canvas");
        this.canvas.className = "lempo-viewport-three";
        this.canvas.style.cssText = "width:100%;height:100%;display:block";
        host.appendChild(this.canvas);
        this.statsElement = document.createElement("div");
        this.statsElement.className = "lempo-viewport-stats";
        this.statsElement.style.cssText = "position:fixed;right:12px;top:12px;z-index:1000;padding:5px 8px;border-radius:4px;background:#101218cc;color:#e8edf5;font:11px ui-monospace,monospace;pointer-events:none;white-space:nowrap";
        this.statsElement.hidden = !this.visible.stats;
        host.appendChild(this.statsElement);
        this.unbindStats = new StatsHUD(this.statsElement).bind(this);
        this.sceneAdapter = new ThreeScene(this.canvas, this.engine, {
            antialias: false,
            alpha: false,
            maxDpr: 1,
            shadows: false,
            toneMapping: THREE.NoToneMapping,
        });
        this.sceneAdapter.setExternalCamera(true);
        this.renderer = this.sceneAdapter.renderer;
        this.camera = this.sceneAdapter.camera;
        this.camera.position.set(7, 6, 10);
        this.camera.lookAt(0, 0, 0);
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = false;
        this.controls.screenSpacePanning = true;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 5000;
        this.controls.addEventListener("change", this.onCameraChange);
        this.emitter.add(this.emitterAxes);
        this.emitter.visible = false;
        this.sceneAdapter.scene.add(this.emitter);
        this.transformControls = new TransformControls(this.camera, this.canvas);
        this.transformControls.setMode("translate");
        this.transformControls.getHelper().visible = false;
        this.sceneAdapter.scene.add(this.transformControls.getHelper());
        this.transformControls.addEventListener("dragging-changed", this.onDraggingChanged);
        this.transformControls.addEventListener("objectChange", this.onEmitterChanged);
        this.viewHelper = new ViewHelper(this.camera, this.canvas);
        this.viewHelper.setLabels("X", "Y", "Z");
        this.canvas.addEventListener("pointerdown", this.onViewHelperPointerDown, true);
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
            this.engine.update(FIXED_DT, 0, 0);
        this.invalidate();
    }
    update(dt) {
        if (this.viewHelper.animating) {
            this.viewHelper.update(dt);
            this.helperDirty = true;
            this.invalidate();
        }
        if (this.playing && this.source)
            this.engine.update(dt, 0, 0);
    }
    render() {
        if (this.disposed)
            return;
        const renderStart = performance.now();
        this.sceneAdapter.setView(this.visible);
        this.sceneAdapter.render();
        if (this.helperDirty || this.viewHelper.animating) {
            this.viewHelper.render(this.renderer);
            this.helperDirty = false;
        }
        this.reportStats(performance.now() - renderStart);
    }
    setTool(tool) {
        if (tool === "move") {
            this.emitter.visible = true;
            this.transformControls.attach(this.emitter);
            this.transformControls.getHelper().visible = true;
        }
        else {
            this.emitter.visible = false;
            this.transformControls.detach();
            this.transformControls.getHelper().visible = false;
        }
        this.invalidate();
    }
    setView(opts) {
        this.visible = { ...this.visible, ...opts };
        this.statsElement.hidden = !this.visible.stats;
        this.invalidate();
    }
    setQuality(quality) {
        this.quality = quality;
        const cap = quality === "low" ? 1 : quality === "medium" ? 1.5 : 2;
        const particleCap = quality === "low" ? 600 : quality === "medium" ? 1500 : 4000;
        this.sceneAdapter.setQuality(cap, particleCap, this.renderScale);
        this.resize();
    }
    setRenderScale(scale) {
        this.renderScale = Math.max(0.5, Math.min(1, scale));
        const tier = this.quality === "auto" ? "high" : this.quality;
        const cap = tier === "low" ? 1 : tier === "medium" ? 1.5 : 2;
        const particleCap = tier === "low" ? 600 : tier === "medium" ? 1500 : 4000;
        this.sceneAdapter?.setQuality(cap, particleCap, this.renderScale);
        this.resize();
    }
    resize(w, h, dpr = window.devicePixelRatio || 1) {
        if (!this.renderer || this.disposed)
            return;
        const rect = this.host.getBoundingClientRect();
        const width = Math.max(1, Math.floor(w ?? rect.width));
        const height = Math.max(1, Math.floor(h ?? rect.height));
        const tier = this.quality === "auto" ? "high" : this.quality;
        const cap = tier === "low" ? 1 : tier === "medium" ? 1.5 : 2;
        this.renderer.setPixelRatio(Math.min(dpr, cap * this.renderScale));
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.invalidate();
    }
    on(event, callback) {
        this.listeners[event].add(callback);
        return () => { this.listeners[event].delete(callback); };
    }
    reportStats(frameMs) {
        if (!this.visible.stats)
            return;
        const now = performance.now();
        this.statsFrames++;
        this.statsFrameTotal += frameMs;
        this.frameSamples[this.frameSampleIndex] = frameMs;
        this.frameSampleIndex = (this.frameSampleIndex + 1) % this.frameSamples.length;
        this.frameSampleCount = Math.min(this.frameSampleCount + 1, this.frameSamples.length);
        if (!this.statsAt) {
            this.statsAt = now;
            return;
        }
        const elapsed = now - this.statsAt;
        if (elapsed < 1000)
            return;
        const sorted = [];
        for (let i = 0; i < this.frameSampleCount; i++)
            sorted.push(this.frameSamples[i]);
        sorted.sort((a, b) => a - b);
        const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
        const tier = this.quality === "auto" ? "high" : this.quality;
        this.emit("stats", {
            fps: this.statsFrames * 1000 / elapsed,
            frameMs: this.statsFrameTotal / this.statsFrames,
            p95Ms: p95,
            drawCalls: this.renderer.info.render.calls,
            triangles: this.renderer.info.render.triangles,
            particles: this.engine.activeCount,
            particlesCap: tier === "low" ? 600 : tier === "medium" ? 1500 : 4000,
            dpr: this.renderer.getPixelRatio(), renderScale: this.renderScale, tier,
        });
        this.statsAt = now;
        this.statsFrames = 0;
        this.statsFrameTotal = 0;
    }
    dispose() {
        if (this.disposed || !this.canvas)
            return;
        this.disposed = true;
        this.resizeObserver.disconnect();
        this.controls.removeEventListener("change", this.onCameraChange);
        this.controls.dispose();
        this.transformControls.removeEventListener("dragging-changed", this.onDraggingChanged);
        this.transformControls.removeEventListener("objectChange", this.onEmitterChanged);
        this.transformControls.dispose();
        this.canvas.removeEventListener("pointerdown", this.onViewHelperPointerDown, true);
        this.viewHelper.dispose();
        this.unbindStats?.();
        this.unbindStats = null;
        this.statsElement.remove();
        this.sceneAdapter.dispose();
        this.canvas.remove();
        this.listeners.emitterMoved.clear();
        this.listeners.pick.clear();
        this.listeners.stats.clear();
        this.listeners.error.clear();
        this.source = null;
        this.host = null;
        this.canvas = null;
        this.statsElement = null;
        this.sceneAdapter = null;
        this.renderer = null;
        this.camera = null;
        this.controls = null;
        this.transformControls = null;
        this.viewHelper = null;
    }
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
