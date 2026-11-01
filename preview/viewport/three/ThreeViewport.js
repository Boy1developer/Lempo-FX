import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
/**
 * Renderer/camera foundation for the planned 3D viewport.
 * Particle and editor-guide layers are added in later Phase 2 tasks. This
 * class deliberately does not start its own frame loop; the controller calls
 * render() after the camera reports a change or while simulation is playing.
 */
export class ThreeViewport {
    constructor(host, invalidate = () => { }) {
        this.host = host;
        this.invalidate = invalidate;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
        this.resizeObserver = null;
        this.disposed = false;
        this.onResize = () => { this.resize(); };
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
        this.controls.addEventListener("change", this.invalidate);
        const grid = new THREE.GridHelper(20, 20, 0x54566c, 0x30313d);
        this.scene.add(grid);
        this.resizeObserver = new ResizeObserver(this.onResize);
        this.resizeObserver.observe(host);
        this.resize();
    }
    resize(width, height, devicePixelRatio = window.devicePixelRatio || 1) {
        if (this.disposed)
            return;
        const bounds = this.host.getBoundingClientRect();
        const w = Math.max(1, Math.floor(width ?? bounds.width));
        const h = Math.max(1, Math.floor(height ?? bounds.height));
        this.renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 0.5), 1));
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.invalidate();
    }
    render() {
        if (!this.disposed)
            this.renderer.render(this.scene, this.camera);
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.controls.removeEventListener("change", this.invalidate);
        this.controls.dispose();
        this.scene.traverse((object) => {
            const renderable = object;
            renderable.geometry?.dispose();
            const materials = renderable.material;
            if (Array.isArray(materials))
                materials.forEach((material) => material.dispose());
            else
                materials?.dispose();
        });
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
