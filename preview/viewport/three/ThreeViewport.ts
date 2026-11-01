import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { ViewHelper } from "three/addons/helpers/ViewHelper.js";
import type { Tool, ViewportEvent, ViewportEventPayload } from "../Viewport.js";

/**
 * Renderer/camera foundation for the planned 3D viewport.
 * Particle and editor-guide layers are added in later Phase 2 tasks. This
 * class deliberately does not start its own frame loop; the controller calls
 * render() after the camera reports a change or while simulation is playing.
 */
export class ThreeViewport {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly transformControls: TransformControls;
  readonly viewHelper: ViewHelper;
  private readonly emitter = new THREE.Object3D();
  private readonly grid: THREE.GridHelper;
  private readonly listeners: Record<ViewportEvent, Set<(payload: unknown) => void>> = {
    emitterMoved: new Set(), pick: new Set(), stats: new Set(), error: new Set(),
  };
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private viewHelperDirty = true;
  private gizmoDragging = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly invalidate: () => void = () => {},
  ) {
    const canvas = document.createElement("canvas");
    canvas.className = "lempo-viewport-three";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene.background = new THREE.Color("#14151c");
    this.camera.position.set(7, 6, 10);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 5000;
    this.controls.addEventListener("change", this.onCameraChange);

    this.transformControls = new TransformControls(this.camera, canvas);
    this.transformControls.setMode("translate");
    this.transformControls.getHelper().visible = false;
    this.scene.add(this.transformControls.getHelper());
    this.scene.add(this.emitter);
    this.emitter.visible = false;
    this.emitter.add(new THREE.AxesHelper(1.5));
    this.transformControls.addEventListener("dragging-changed", this.onGizmoDraggingChanged);
    this.transformControls.addEventListener("objectChange", this.onGizmoObjectChange);

    this.viewHelper = new ViewHelper(this.camera, canvas);
    this.viewHelper.setLabels("X", "Y", "Z");
    canvas.addEventListener("pointerdown", this.onViewHelperPointerDown, true);

    this.grid = new THREE.GridHelper(20, 20, 0x54566c, 0x30313d);
    this.scene.add(this.grid);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(host);
    this.resize();
  }

  resize(width?: number, height?: number, devicePixelRatio = window.devicePixelRatio || 1): void {
    if (this.disposed) return;
    const bounds = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(width ?? bounds.width));
    const h = Math.max(1, Math.floor(height ?? bounds.height));
    this.renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 0.5), 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    if (this.viewHelperDirty || this.viewHelper.animating) {
      this.viewHelper.render(this.renderer);
      this.viewHelperDirty = false;
    }
  }

  /** Advance only the view-helper's camera snap animation, if one is active. */
  update(dt: number): void {
    if (this.disposed || !this.viewHelper.animating) return;
    this.viewHelper.update(dt);
    this.viewHelperDirty = true;
    this.invalidate();
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

  on<E extends ViewportEvent>(
    event: E,
    callback: (payload: ViewportEventPayload[E]) => void,
  ): void {
    this.listeners[event].add(callback as (payload: unknown) => void);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer.domElement.removeEventListener("pointerdown", this.onViewHelperPointerDown, true);
    this.controls.removeEventListener("change", this.onCameraChange);
    this.controls.dispose();
    this.transformControls.removeEventListener("dragging-changed", this.onGizmoDraggingChanged);
    this.transformControls.removeEventListener("objectChange", this.onGizmoObjectChange);
    this.transformControls.dispose();
    this.viewHelper.dispose();
    this.scene.traverse((object) => {
      const renderable = object as THREE.Mesh;
      renderable.geometry?.dispose();
      const materials = renderable.material;
      if (Array.isArray(materials)) materials.forEach((material) => material.dispose());
      else materials?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private onCameraChange = (): void => {
    this.viewHelperDirty = true;
    this.invalidate();
  };

  private onGizmoDraggingChanged = (event: { value?: unknown }): void => {
    this.gizmoDragging = Boolean(event.value);
    this.controls.enabled = !this.gizmoDragging;
  };

  private onGizmoObjectChange = (): void => {
    if (!this.gizmoDragging) return;
    const position = this.emitter.position;
    this.emit("emitterMoved", { x: position.x, y: position.y, z: position.z });
    this.invalidate();
  };

  private onViewHelperPointerDown = (event: PointerEvent): void => {
    if (!this.viewHelper.handleClick(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.viewHelperDirty = true;
    this.invalidate();
  };

  private emit<E extends ViewportEvent>(event: E, payload: ViewportEventPayload[E]): void {
    for (const listener of this.listeners[event]) listener(payload);
  }

  private onResize = (): void => { this.resize(); };
}
