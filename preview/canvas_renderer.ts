/** Canvas fallback renderer for the fast preview; simulation remains in lempo-runtime. */
import type { ParticleEngine } from "./preview.js";
import {
  coreColor, flickerFactor, flooredWidth, lutColor, outerColor, strideIndices,
  type TrailCfg, type TrailKey, type TrailPt,
} from "./trails.js";

export class CanvasPreviewRenderer {
  constructor(private readonly engine: ParticleEngine) {}

  private project(x: number, y: number, z: number, cx: number, cy: number, focal: number):
      [number, number, number, number] {
    return this.engine.project(x, y, z, cx, cy, focal);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (!this.engine.trailsHideDots()) {
      for (let i = 0; i < this.engine.activeCount; i++) {
        const p = this.engine.particleState(i);
        const s = this.engine.sampleAt(p.age, i);
        this.traceShape(ctx, s.shape, p.x, p.y, s.size,
          `rgba(${s.r},${s.g},${s.b},${s.a.toFixed(3)})`,
          `rgba(${s.r},${s.g},${s.b},${(s.a * 0.35).toFixed(3)})`);
      }
    }
    const tf = this.engine.trailFrame();
    if (tf) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const tr of tf.trails)
        this.traceTrail(ctx, tr.pts.map((p) => [p.x, p.y] as [number, number]), String(tr.key), tf);
    }
    ctx.restore();
  }

  renderScene(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = "#14151c"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1e1f28";
    const tile = 18;
    for (let y = 0; y < H; y += tile)
      for (let x = ((y / tile) % 2) * tile; x < W; x += tile * 2)
        ctx.fillRect(x, y, tile, tile);
    const cx = W / 2, cy = H * 0.52;
    const focal = (H * 0.5) / Math.tan(30 * Math.PI / 180);
    ctx.strokeStyle = "#2c2e44"; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = -5; k <= 5; k++) {
      const d = k * 52;
      let a = this.project(-260, 0, d, cx, cy, focal);
      let b = this.project(260, 0, d, cx, cy, focal);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      a = this.project(d, 0, -260, cx, cy, focal);
      b = this.project(d, 0, 260, cx, cy, focal);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    const origin = this.project(0, 0, 0, cx, cy, focal);
    const axes: Array<[number, number, number, string]> =
      [[70, 0, 0, "#ff3b3b"], [0, 70, 0, "#3ddc84"], [0, 0, 70, "#2f6bff"]];
    ctx.lineWidth = 3;
    for (const [ax, ay, az, color] of axes) {
      const point = this.project(ax, ay, az, cx, cy, focal);
      ctx.strokeStyle = color; ctx.beginPath();
      ctx.moveTo(origin[0], origin[1]); ctx.lineTo(point[0], point[1]); ctx.stroke();
    }
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(origin[0], origin[1], 6, 0, 6.2832); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    if (!this.engine.trailsHideDots()) {
      for (let i = 0; i < this.engine.activeCount; i++) {
        const p = this.engine.particleState(i);
        const projected = this.project(p.x, p.y, p.z, cx, cy, focal);
        const s = this.engine.sampleAt(p.age, i);
        this.traceShape(ctx, s.shape, projected[0], projected[1], Math.max(1, s.size * projected[2]),
          `rgba(${s.r},${s.g},${s.b},${s.a.toFixed(3)})`,
          `rgba(${s.r},${s.g},${s.b},${(s.a * 0.35).toFixed(3)})`);
      }
    }
    const tf = this.engine.trailFrame();
    if (tf) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const tr of tf.trails) {
        const points = tr.pts.map((p) => {
          const q = this.project(p.x, p.y, p.z, cx, cy, focal);
          return [q[0], q[1]] as [number, number];
        });
        this.traceTrail(ctx, points, String(tr.key), tf);
      }
    }
    ctx.restore();
  }

  private traceTrail(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, key: string,
    tf: { cfg: TrailCfg; wlut: number[]; grad: Array<[number, number, number, number]>;
      now: number; trails: Array<{ key: TrailKey; pts: TrailPt[] }> }): void {
    const n = pts.length;
    if (n < 2) return;
    const idx = strideIndices(n, 24);
    let acc = 0;
    for (let i = 0; i < key.length; i++) acc += key.charCodeAt(i);
    const flicker = flickerFactor(tf.now, tf.cfg.flickerHz, tf.cfg.flickerAmt, (acc % 1000) / 1000);
    for (let s = 0; s < idx.length - 1; s++) {
      const a = pts[idx[s]], b = pts[idx[s + 1]];
      const t = 1 - (idx[s] + idx[s + 1]) / 2 / (n - 1);
      const width = flooredWidth(t, tf.cfg, tf.wlut);
      const [r, g, bl, al] = lutColor(tf.grad, t);
      const [or, og, ob] = outerColor([r, g, bl], tf.cfg.edgeColor, tf.cfg.intensity);
      const [cr, cg, cb] = coreColor([r, g, bl], tf.cfg.coreColor, tf.cfg.intensity);
      const alpha = Math.max(0, Math.min(1, (al / 255) * flicker));
      if (alpha <= 0 || width <= 0) continue;
      ctx.strokeStyle = `rgba(${or | 0},${og | 0},${ob | 0},${alpha.toFixed(3)})`;
      ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha.toFixed(3)})`;
      ctx.lineWidth = Math.max(1, width * tf.cfg.coreWidth);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }

  private traceShape(ctx: CanvasRenderingContext2D, shape: string, x: number, y: number,
    r: number, color: string, glow: string): void {
    const poly = (pts: number[]): void => {
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, 6.2832); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + pts[0] * r, y + pts[1] * r);
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(x + pts[k] * r, y + pts[k + 1] * r);
      ctx.closePath(); ctx.fill();
    };
    switch (shape) {
      case "square": case "cube": case "billboard": poly([-1, -1, 1, -1, 1, 1, -1, 1]); return;
      case "triangle": case "pyramid": poly([0, -1.2, 1.1, 0.9, -1.1, 0.9]); return;
      case "diamond": poly([0, -1, 0.7, 0, 0, 1, -0.7, 0]); return;
      case "star": {
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, 6.2832); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 === 0 ? r : r * 0.45;
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); return;
      }
      case "line":
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, r * 0.5);
        ctx.beginPath(); ctx.moveTo(x - r * 1.6, y); ctx.lineTo(x + r * 1.6, y); ctx.stroke(); return;
      case "torus":
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 6.2832); ctx.fill();
        ctx.globalCompositeOperation = "lighter"; return;
      case "custom":
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x - r, y - r, r * 2, r * 2); return;
      default:
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, 6.2832); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
  }
}
