import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { ViewHelper } from "three/addons/helpers/ViewHelper.js";
import { ParticleEngine } from "../../../lempo-runtime/src/engine.js";
import type { Quality } from "../QualityManager.js";
import type {
  EffectJSON, PatchOp, Tier, Tool, Viewport, ViewportEvent,
  ViewportEventPayload,
} from "../Viewport.js";
import { ThreeScene } from "../../three_scene.js";

const FIXED_DT = 1 / 60;

/** Three.js viewport adapter; owns controls while ThreeScene owns particle rendering. */
export class ThreeViewport implements Viewport {
  readonly engine = new ParticleEngine();
  sceneAdapter!: ThreeScene;
  renderer!: THREE.WebGLRenderer;
  camera!: THREE.PerspectiveCamera;
  controls!: OrbitControls;
  transformControls!: TransformControls;
  viewHelper!: ViewHelper;

  private canvas!: HTMLCanvasElement;
  private host!: HTMLElement;
  private resizeObserver!: ResizeObserver;
  private emitter = new THREE.Object3D();
  private emitterAxes = new THREE.AxesHelper(30);
  private listeners: Record<ViewportEvent, Set<(payload: unknown) => void>> = {
    emitterMoved: new Set(), pick: new Set(), stats: new Set(), error: new Set(),
  };
  private source: EffectJSON | null = null;
  private disposed = false;
  private playing = true;
  private gizmoDragging = false;
  private helperDirty = true;
  private quality: Quality = "low";
  private visible = { grid: true, guides: true, stats: true };

  constructor(private readonly invalidate: () => void = () => {}) {}

  mount(host: HTMLElement): void {
    if (this.canvas) throw new Error("ThreeViewport is already mounted");
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "lempo-viewport-three";
    this.canvas.style.cssText = "width:100%;height:100%;display:block";
    host.appendChild(this.canvas);

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

  setEffect(effect: EffectJSON): void {
    this.source = structuredClone(effect);
    this.engine.loadEffect(this.source);
    this.invalidate();
  }

  patch(ops: PatchOp[]): void {
    if (!this.source) throw new Error("Cannot patch before setEffect");
    const next = structuredClone(this.source) as unknown as Record<string, unknown>;
    for (const op of ops) applyJsonPointer(next, op.path, op.value);
    this.source = next as unknown as EffectJSON;
    this.engine.loadEffect(this.source);
    this.invalidate();
  }

  play(): void { this.playing = true; }
  pause(): void { this.playing = false; }
  restart(): void {
    if (this.source) this.engine.loadEffect(this.source);
    this.invalidate();
  }
  seek(t: number): void {
    if (!this.source) return;
    this.engine.loadEffect(this.source);
    const steps = Math.min(3600, Math.max(0, Math.floor(t / FIXED_DT)));
    for (let i = 0; i < steps; i++) this.engine.update(FIXED_DT, 0, 0);
    this.invalidate();
  }

  update(dt: number): void {
    if (this.viewHelper.animating) {
      this.viewHelper.update(dt);
      this.helperDirty = true;
      this.invalidate();
    }
    if (this.playing && this.source) this.engine.update(dt, 0, 0);
  }

  render(): void {
    if (this.disposed) return;
    this.sceneAdapter.setView(this.visible);
    this.sceneAdapter.render();
    if (this.helperDirty || this.viewHelper.animating) {
      this.viewHelper.render(this.renderer);
      this.helperDirty = false;
    }
  }

  setTool(tool: Tool): void {
    if (tool === "move") {
      this.emitter.visible = true;
      this.transformControls.attach(this.emitter);
      this.transformControls.getHelper().visible = true;
    } else {
      this.emitter.visible = false;
      this.transformControls.detach();
      this.transformControls.getHelper().visible = false;
    }
    this.invalidate();
  }

  setView(opts: { grid?: boolean; guides?: boolean; stats?: boolean }): void {
    this.visible = { ...this.visible, ...opts };
    this.invalidate();
  }

  setQuality(quality: Tier | "auto"): void {
    this.quality = quality;
    const cap = quality === "low" ? 1 : quality === "medium" ? 1.5 : 2;
    const particleCap = quality === "low" ? 600 : quality === "medium" ? 1500 : 4000;
    this.sceneAdapter.setQuality(cap, particleCap);
    this.resize();
  }

  resize(w?: number, h?: number, dpr = window.devicePixelRatio || 1): void {
    if (!this.renderer || this.disposed) return;
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(w ?? rect.width));
    const height = Math.max(1, Math.floor(h ?? rect.height));
    const cap = this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  on<E extends ViewportEvent>(event: E, callback: (payload: ViewportEventPayload[E]) => void): void {
    this.listeners[event].add(callback as (payload: unknown) => void);
  }

  dispose(): void {
    if (this.disposed || !this.canvas) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.onCameraChange);
    this.controls.dispose();
    this.transformControls.removeEventListener("dragging-changed", this.onDraggingChanged);
    this.transformControls.removeEventListener("objectChange", this.onEmitterChanged);
    this.transformControls.dispose();
    this.canvas.removeEventListener("pointerdown", this.onViewHelperPointerDown, true);
    this.viewHelper.dispose();
    this.sceneAdapter.dispose();
    this.canvas.remove();
  }

  private onCameraChange = (): void => {
    this.helperDirty = true;
    this.invalidate();
  };
  private onDraggingChanged = (event: { value?: unknown }): void => {
    this.gizmoDragging = Boolean(event.value);
    this.controls.enabled = !this.gizmoDragging;
  };
  private onEmitterChanged = (): void => {
    if (!this.gizmoDragging) return;
    const { x, y, z } = this.emitter.position;
    this.emit("emitterMoved", { x, y, z });
    this.invalidate();
  };
  private onViewHelperPointerDown = (event: PointerEvent): void => {
    if (!this.viewHelper.handleClick(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.helperDirty = true;
    this.invalidate();
  };
  private onResize = (): void => { this.resize(); };
  private emit<E extends ViewportEvent>(event: E, payload: ViewportEventPayload[E]): void {
    for (const listener of this.listeners[event]) listener(payload);
  }
}

function applyJsonPointer(root: Record<string, unknown>, pointer: string, value: unknown): void {
  if (!pointer.startsWith("/")) throw new Error(`Invalid JSON Pointer: ${pointer}`);
  const parts = pointer.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let parent: unknown = root;
  for (const part of parts.slice(0, -1)) {
    if (!parent || typeof parent !== "object") throw new Error(`Missing path: ${pointer}`);
    parent = (parent as Record<string, unknown>)[part];
  }
  const last = parts[parts.length - 1];
  if (!last || !parent || typeof parent !== "object") throw new Error(`Invalid path: ${pointer}`);
  (parent as Record<string, unknown>)[last] = value;
}
