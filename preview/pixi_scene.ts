/**
 * PixiJS WebGL layer for the ParticleFX fast preview (2D mode).
 * - Reuses the ParticleEngine simulation + keyframe morph sampling
 * - One shared sprite pool (4000) with baked-glow textures per shape,
 *   tinted per particle, additive blending — same look as the 2D canvas
 *   preview, GPU-batched
 */
import * as PIXI from "pixi.js";
import type { ParticleEngine } from "./preview.js";
import { SHAPE_ORDER } from "../lempo-runtime/src/index.js";
import {
  TrailCfg, TrailPt, TrailKey, flooredWidth, lutColor, outerColor,
  coreColor, flickerFactor, strideIndices,
} from "./trails.js";

const POOL = 4000;
const TEX = 128;          // texture atlas cell (px)
const TEX_R = TEX * 0.26; // shape radius inside the cell (room for glow)
const TRAIL_CAP = 384;    // max ribbons drawn per frame
const TRAIL_ST = 17;      // stations per ribbon

type Ctx2D = CanvasRenderingContext2D;

function bake(draw: (g: Ctx2D, c: number, r: number) => void): PIXI.Texture {
  const c: HTMLCanvasElement = document.createElement("canvas");
  c.width = TEX; c.height = TEX;
  const g: Ctx2D | null = c.getContext("2d");
  if (!g) throw new Error("2d context unavailable");
  g.clearRect(0, 0, TEX, TEX);
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#ffffff";
  g.lineWidth = Math.max(2, TEX * 0.03);
  g.shadowColor = "rgba(255,255,255,0.85)";
  g.shadowBlur = TEX * 0.10;
  draw(g, TEX / 2, TEX_R);
  return PIXI.Texture.from(c);
}

function starPath(g: Ctx2D, c: number, r: number): void {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a: number = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr: number = (k % 2 === 0) ? r : r * 0.45;
    const x: number = c + Math.cos(a) * rr, y: number = c + Math.sin(a) * rr;
    if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath(); g.fill();
}

function buildTextures(): Record<string, PIXI.Texture> {
  const circle = (g: Ctx2D, c: number, r: number): void => {
    g.beginPath(); g.arc(c, c, r, 0, 6.2832); g.fill();
  };
  return {
    sphere: bake(circle),
    circle: bake(circle),
    square: bake((g, c, r) => { g.fillRect(c - r, c - r, r * 2, r * 2); }),
    cube: bake((g, c, r) => { g.fillRect(c - r * 0.9, c - r * 0.9, r * 1.8, r * 1.8); }),
    billboard: bake((g, c, r) => { g.fillRect(c - r, c - r, r * 2, r * 2); }),
    triangle: bake((g, c, r) => {
      g.beginPath(); g.moveTo(c, c - r * 1.2);
      g.lineTo(c + r * 1.1, c + r * 0.9); g.lineTo(c - r * 1.1, c + r * 0.9);
      g.closePath(); g.fill();
    }),
    pyramid: bake((g, c, r) => {
      g.beginPath(); g.moveTo(c, c - r * 1.2);
      g.lineTo(c + r * 1.1, c + r * 0.8); g.lineTo(c - r * 1.1, c + r * 0.8);
      g.closePath(); g.fill();
    }),
    diamond: bake((g, c, r) => {
      g.beginPath(); g.moveTo(c, c - r); g.lineTo(c + r * 0.7, c);
      g.lineTo(c, c + r); g.lineTo(c - r * 0.7, c);
      g.closePath(); g.fill();
    }),
    star: bake(starPath),
    line: bake((g, c, r) => { g.fillRect(c - r * 1.6, c - r * 0.22, r * 3.2, r * 0.44); }),
    torus: bake((g, c, r) => {
      g.beginPath(); g.arc(c, c, r, 0, 6.2832); g.fill();
      g.save();
      g.globalCompositeOperation = "destination-out";
      g.shadowBlur = 0;
      g.beginPath(); g.arc(c, c, r * 0.45, 0, 6.2832); g.fill();
      g.restore();
    }),
    custom: bake((g, c, r) => { g.strokeRect(c - r, c - r, r * 2, r * 2); }),
  };
}

export class PixiScene {
  private app: PIXI.Application = new PIXI.Application();
  private world!: PIXI.Container;
  private particleLayer!: PIXI.Container;
  private particleBuckets = new Map<string, PIXI.ParticleContainer<PIXI.Particle>>();
  private particlesByShape = new Map<string, PIXI.Particle[]>();
  private trails!: PIXI.Graphics;
  private trailMeshes: PIXI.Mesh[] = [];
  private trailPositions: Float32Array[] = [];
  private trailDynamic = false;
  private gizmo!: PIXI.Graphics;
  private grid!: PIXI.Graphics;
  private tex: Record<string, PIXI.Texture> = {};
  private customTex: Map<string, PIXI.Texture> = new Map();
  private lastW = 0;
  private lastH = 0;
  private blend = "";
  private warnedLighten = false;
  private maxDpr = 2;
  private particleCap = POOL;
  ready = false;

  constructor(private canvas: HTMLCanvasElement, private engine: ParticleEngine) {}

  async init(options: { maxDpr?: number; antialias?: boolean; dynamicTrails?: boolean } = {}): Promise<void> {
    this.maxDpr = options.maxDpr ?? 2;
    this.trailDynamic = options.dynamicTrails ?? false;
    await this.app.init({
      canvas: this.canvas,
      background: "#14151c",
      antialias: options.antialias ?? true,
      autoStart: false,
      autoDensity: true,
      resolution: Math.min(options.maxDpr ?? 1, window.devicePixelRatio || 1),
      powerPreference: "high-performance",
      roundPixels: true,
    });
    this.app.ticker.stop();
    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);
    this.tex = buildTextures();
    this.grid = new PIXI.Graphics();
    this.world.addChild(this.grid);
    this.particleLayer = new PIXI.Container();
    this.world.addChild(this.particleLayer);
    this.trails = new PIXI.Graphics();
    this.trails.visible = !this.trailDynamic;
    this.world.addChild(this.trails);
    if (this.trailDynamic) this.createTrailMeshes();
    this.gizmo = new PIXI.Graphics();
    this.world.addChild(this.gizmo);
    this.ready = true;
  }

  /** Render from the viewport's shared animation-frame loop. */
  render(): void {
    if (this.ready) this.app.renderer.render({ container: this.app.stage });
  }

  setTransform(x: number, y: number, zoom: number): void {
    if (!this.ready) return;
    this.world.position.set(x, y);
    this.world.scale.set(zoom);
  }

  setView(options: { grid?: boolean; guides?: boolean }): void {
    if (options.grid !== undefined) this.grid.visible = options.grid;
    if (options.guides !== undefined) this.gizmo.visible = options.guides;
  }

  setQuality(maxDpr: number, particleCap = POOL): void {
    this.maxDpr = Math.max(0.5, Math.min(2, maxDpr));
    this.particleCap = Math.max(1, Math.min(POOL, Math.floor(particleCap)));
    if (this.ready) this.app.renderer.resolution = Math.min(
      this.maxDpr, window.devicePixelRatio || 1);
  }

  resize(width: number, height: number, dpr = window.devicePixelRatio || 1): void {
    if (!this.ready) return;
    this.app.renderer.resolution = Math.min(this.maxDpr, dpr);
    this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
    this.lastW = Math.max(1, width);
    this.lastH = Math.max(1, height);
    this.drawGrid(this.lastW, this.lastH);
  }

  destroy(): void {
    if (!this.ready) return;
    this.app.ticker.stop();
    for (const bucket of this.particleBuckets.values()) bucket.destroy({ children: true });
    this.particleBuckets.clear();
    this.particlesByShape.clear();
    for (const mesh of this.trailMeshes) mesh.destroy({ children: true });
    this.trailMeshes = [];
    this.trailPositions = [];
    for (const texture of this.customTex.values()) texture.destroy(true);
    this.customTex.clear();
    for (const texture of Object.values(this.tex)) texture.destroy(true);
    this.tex = {};
    this.ready = false;
    this.app.destroy({ removeView: false }, { children: true });
  }

  private normShape(shape: string): string {
    const s: string = String(shape ?? "circle").toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.tex, s) ? s : "circle";
  }

  /** Preload custom-shape image textures from refs (served by the preview server). */
  async preloadCustomRefs(refs: string[]): Promise<void> {
    const base = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, "/");
    for (const ref of refs) {
      if (this.customTex.has(ref)) continue;
      try {
        const url = new URL(ref, base).href;
        const t = await PIXI.Texture.from(url);
        this.customTex.set(ref, t);
      } catch (e) {
        console.warn("[PixiScene] Failed to load custom texture:", ref, e);
      }
    }
  }

  /** Lookup a preloaded custom texture by ref; null when not loaded / missing. */
  customTextureFor(ref: string): PIXI.Texture | null {
    return this.customTex.get(ref) ?? null;
  }

  /** Pixi blend string for an effect mode (same fallbacks as the extension). */
  private pixiBlend(mode: string): string {
    switch (String(mode ?? "Normal")) {
      case "Additive": return "add";
      case "Multiply": return "multiply";
      case "Subtractive": return "erase";
      case "Screen": return "screen";
      case "Overlay": return "overlay";
      case "Lighten":
        if (!this.warnedLighten) {
          this.warnedLighten = true;
          console.warn("[Lempo viewport] PixiJS Lighten blending is unsupported; using Normal.");
        }
        return "normal";
      default: return "normal";
    }
  }

  private drawGrid(W: number, H: number): void {
    const g: PIXI.Graphics = this.grid;
    g.clear();
    const horizon: number = H * 0.42;
    g.strokeStyle = { width: 1, color: 0x3a3d55 };
    g.moveTo(0, horizon); g.lineTo(W, horizon);
    g.strokeStyle = { width: 1, color: 0x2c2e44 };
    for (let i = 1; i < 9; i++) {
      const y: number = horizon + (H - horizon) * Math.pow(i / 9, 1.6);
      g.moveTo(0, y); g.lineTo(W, y);
    }
    const ccx: number = W / 2;
    for (let i = -10; i <= 10; i++) {
      g.moveTo(ccx, horizon); g.lineTo(ccx + (i * W) / 14, H);
    }
    g.stroke();
  }

  private createTrailMeshes(): void {
    const indices = new Uint32Array((TRAIL_ST - 1) * 6);
    const uvs = new Float32Array(TRAIL_ST * 4);
    for (let i = 0; i < TRAIL_ST; i++) {
      uvs[i * 4] = i / (TRAIL_ST - 1); uvs[i * 4 + 1] = 0;
      uvs[i * 4 + 2] = i / (TRAIL_ST - 1); uvs[i * 4 + 3] = 1;
      if (i === TRAIL_ST - 1) continue;
      const k = i * 6, v = i * 2;
      indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k);
    }
    for (let i = 0; i < TRAIL_CAP; i++) {
      const positions = new Float32Array(TRAIL_ST * 4);
      const geometry = new PIXI.MeshGeometry({ positions, uvs, indices });
      const mesh = new PIXI.Mesh({ geometry, texture: PIXI.Texture.WHITE });
      mesh.tint = 0xffffff; mesh.alpha = 0; mesh.blendMode = "add";
      this.trailMeshes.push(mesh); this.trailPositions.push(positions);
      this.world.addChild(mesh);
    }
  }

  private syncTrailMesh(mesh: PIXI.Mesh, positions: Float32Array, pts: TrailPt[], cfg: TrailCfg,
    wlut: number[], grad: Array<[number, number, number, number]>): void {
    const ids = strideIndices(pts.length, TRAIL_ST - 1);
    if (ids.length < 2) { mesh.alpha = 0; return; }
    let r = 0, g = 0, b = 0, samples = 0;
    for (let i = 0; i < TRAIL_ST; i++) {
      const t = i / (TRAIL_ST - 1);
      const pt = pts[ids[Math.min(i, ids.length - 1)]];
      const prev = pts[ids[Math.max(0, Math.min(i, ids.length - 1) - 1)]];
      const next = pts[ids[Math.min(ids.length - 1, i + 1)]];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const length = Math.hypot(dx, dy) || 1;
      const half = Math.max(0.5, flooredWidth(t, cfg, wlut) / 2);
      const nx = -dy / length * half, ny = dx / length * half;
      const j = i * 4;
      positions[j] = pt.x + nx; positions[j + 1] = pt.y + ny;
      positions[j + 2] = pt.x - nx; positions[j + 3] = pt.y - ny;
      const [cr, cg, cb] = lutColor(grad, t);
      r += cr; g += cg; b += cb; samples++;
    }
    mesh.geometry.getBuffer("aPosition").update();
    mesh.tint = (Math.round(r / samples) << 16) | (Math.round(g / samples) << 8) | Math.round(b / samples);
    mesh.alpha = Math.max(0, Math.min(1, cfg.intensity));
  }

  /** One ribbon as flat quads (glow + outer + core per segment). */
  private drawRibbon(g: PIXI.Graphics, pts: TrailPt[],
    cfg: TrailCfg, wlut: number[],
    grad: Array<[number, number, number, number]>, now: number,
    key: TrailKey): void {
    const n: number = pts.length;
    const idx: number[] = strideIndices(n, TRAIL_ST - 1);
    const S: number = idx.length;
    if (S < 2) return;
    let acc = 0;
    const ks: string = String(key);
    for (let i = 0; i < ks.length; i++) acc += ks.charCodeAt(i);
    const fl: number = flickerFactor(now, cfg.flickerHz, cfg.flickerAmt,
      (acc % 1000) / 1000);
    // station frames (2D normals, head = newest = last point)
    const fx: number[] = [], fy: number[] = [];
    const nx: number[] = [], ny: number[] = [];
    const tw: number[] = [];
    const te: Array<[number, number, number]> = [];
    const tc: Array<[number, number, number]> = [];
    const ta: number[] = [];
    let lx = 1, ly = 0;
    for (let s = 0; s < S; s++) {
      const p: TrailPt = pts[idx[s]];
      const t: number = 1 - idx[s] / (n - 1);
      const p0: TrailPt = pts[idx[Math.max(0, s - 1)]];
      const p1: TrailPt = pts[idx[Math.min(S - 1, s + 1)]];
      let dx: number = p1.x - p0.x, dy: number = p1.y - p0.y;
      const dl: number = Math.hypot(dx, dy);
      if (dl > 1e-6) { lx = -dy / dl; ly = dx / dl; }
      const w: number = flooredWidth(t, cfg, wlut);
      const [r, gg, b, a] = lutColor(grad, t);
      fx.push(p.x); fy.push(p.y); nx.push(lx); ny.push(ly); tw.push(w);
      te.push(outerColor([r, gg, b], cfg.edgeColor, cfg.intensity));
      tc.push(coreColor([r, gg, b], cfg.coreColor, cfg.intensity));
      ta.push(Math.max(0, Math.min(1, (a / 255) * fl)));
    }
    const quad = (half: (s: number) => number,
      col: (s: number) => [number, number, number],
      alpha: (s: number) => number): void => {
      for (let s = 0; s < S - 1; s++) {
        const h0: number = half(s), h1: number = half(s + 1);
        const c0 = col(s), c1 = col(s + 1);
        const a0: number = alpha(s), a1: number = alpha(s + 1);
        if (Math.max(a0, a1) <= 0) continue;
        const am: number = (a0 + a1) / 2;
        const rm: number = Math.round((c0[0] + c1[0]) / 2);
        const gm: number = Math.round((c0[1] + c1[1]) / 2);
        const bm: number = Math.round((c0[2] + c1[2]) / 2);
        g.poly([
          fx[s] + nx[s] * h0, fy[s] + ny[s] * h0,
          fx[s] - nx[s] * h0, fy[s] - ny[s] * h0,
          fx[s + 1] - nx[s + 1] * h1, fy[s + 1] - ny[s + 1] * h1,
          fx[s + 1] + nx[s + 1] * h1, fy[s + 1] + ny[s + 1] * h1,
        ]).fill({ color: (rm << 16) | (gm << 8) | bm, alpha: am });
      }
    };
    const gw: number = Math.max(0, cfg.glowWidth);
    const ga: number = Math.max(0, Math.min(1, cfg.glowAlpha));
    if (gw > 0 && ga > 0) {
      quad((s) => tw[s] / 2 + gw,
        (s) => te[s],
        (s) => ta[s] * ga);
    }
    quad((s) => tw[s] / 2, (s) => te[s], (s) => ta[s]);
    const cw: number = Math.max(0, Math.min(1, cfg.coreWidth));
    if (cw > 0) {
      quad((s) => (tw[s] / 2) * cw, (s) => tc[s], (s) => ta[s]);
    }
  }

  /** Sync sprites from engine state; rendering is driven by ViewportController. */
  sync(ex: number, ey: number): void {
    if (!this.ready) return;
    // Lazily preload any custom-shape image textures not yet loaded (covers
    // the boot race where pixi.init() finishes after the first applyEffect).
    const pending = this.engine.customImageRefs?.().filter(
      (r: string) => !this.customTex.has(r)
    );
    if (pending.length) this.preloadCustomRefs(pending);
    const W: number = Math.max(1, Math.round(this.canvas.clientWidth || 1));
    const H: number = Math.max(1, Math.round(this.canvas.clientHeight || 1));
    if (W !== this.lastW || H !== this.lastH) {
      this.lastW = W; this.lastH = H;
      const dpr: number = Math.min(this.maxDpr, window.devicePixelRatio || 1);
      this.app.renderer.resolution = dpr;
      this.app.renderer.resize(W, H);
      this.drawGrid(W, H);
    }
    const frame = this.engine.writeFrame();
    const n: number = Math.min(frame.count, POOL, this.particleCap);
    const wantBlend: string = this.pixiBlend(this.engine.blendingMode());
    if (wantBlend !== this.blend) {
      this.blend = wantBlend;
      for (const bucket of this.particleBuckets.values()) bucket.blendMode = wantBlend as PIXI.BLEND_MODES;
    }
    const hideDots: boolean = this.engine.trailsHideDots();
    const grouped = new Map<string, Array<{ x: number; y: number; size: number; color: number }>>();
    const textures = new Map<string, PIXI.Texture>();
    // One lazily grown ParticleContainer per shape keeps texture state shared
    // within a batch while the total live particle capacity stays bounded.
    const M = 96;
    for (let i = 0; i < n; i++) {
      if (hideDots) continue;
      const p = i * 3;
      const x = frame.position[p], y = frame.position[p + 1];
      if (x < -M || y < -M || x > W + M || y > H + M) {
        continue;
      }
      const shape = this.normShape(SHAPE_ORDER[frame.shape[i]]);
      const ref = shape === "custom" ? this.engine.customRefAt(frame.age[i]) : null;
      const texture = ref ? this.customTextureFor(ref) : null;
      const bucketKey = texture && ref ? `custom:${ref}` : shape;
      const entries = grouped.get(bucketKey) ?? [];
      textures.set(bucketKey, texture ?? this.tex[shape]);
      const color = ((Math.max(0, Math.min(255, Math.round(frame.alpha[i] * 255))) << 24) |
        (frame.color[p] << 16) | (frame.color[p + 1] << 8) | frame.color[p + 2]) >>> 0;
      entries.push({ x, y, size: Math.max(0.5, frame.size[i] / TEX_R), color });
      grouped.set(bucketKey, entries);
    }
    for (const [shape, entries] of grouped) {
      let bucket = this.particleBuckets.get(shape);
      let particles = this.particlesByShape.get(shape);
      if (!bucket || !particles) {
        bucket = new PIXI.ParticleContainer({
          texture: textures.get(shape)!,
          dynamicProperties: { position: true, vertex: true, color: true, rotation: false, uvs: false },
          roundPixels: true,
        });
        bucket.blendMode = wantBlend as PIXI.BLEND_MODES;
        particles = [];
        this.particleBuckets.set(shape, bucket);
        this.particlesByShape.set(shape, particles);
        this.particleLayer.addChild(bucket);
      }
      while (particles.length < entries.length) {
        const particle = new PIXI.Particle({ texture: textures.get(shape)!, anchorX: 0.5, anchorY: 0.5 });
        particles.push(particle);
        bucket.addParticle(particle);
      }
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        const entry = entries[i];
        if (!entry) { particle.scaleX = 0; particle.scaleY = 0; continue; }
        particle.x = entry.x; particle.y = entry.y;
        particle.scaleX = entry.size; particle.scaleY = entry.size;
        particle.color = entry.color;
      }
    }
    for (const [shape, particles] of this.particlesByShape) {
      if (!grouped.has(shape)) for (const particle of particles) { particle.scaleX = 0; particle.scaleY = 0; }
    }
    // ribbons (cleared + redrawn every frame; hidden without a block)
    const gz0: PIXI.Graphics = this.trails;
    if (!this.trailDynamic) gz0.clear();
    const tf = this.engine.trailFrame();
    if (tf) {
      const list = tf.trails;
      const use: number = Math.min(list.length, TRAIL_CAP);
      for (let r = 0; r < use; r++) {
        const tr = list[r];
        if (this.trailDynamic) this.syncTrailMesh(this.trailMeshes[r], this.trailPositions[r],
          tr.pts, tf.cfg, tf.wlut, tf.grad);
        else this.drawRibbon(gz0, tr.pts, tf.cfg, tf.wlut, tf.grad, tf.now, tr.key);
      }
      if (this.trailDynamic) for (let r = use; r < TRAIL_CAP; r++) this.trailMeshes[r].alpha = 0;
    }
    else if (this.trailDynamic) for (const mesh of this.trailMeshes) mesh.alpha = 0;
    // emitter gizmo (X red / Y blue)
    const gz: PIXI.Graphics = this.gizmo;
    gz.clear();
    gz.rect(ex, ey - 2, 95, 4); gz.fill({ color: 0xff3b3b });
    gz.rect(ex - 2, ey - 95, 4, 95); gz.fill({ color: 0x2f6bff });
  }
}
