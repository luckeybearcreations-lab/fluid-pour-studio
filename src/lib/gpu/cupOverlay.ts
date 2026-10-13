// Draws the paint cup over the canvas while a pour runs: tipped over the
// canvas with a stream of the layer that is leaving it, or upside down on the
// canvas for a flip cup. Drawn on its own 2D canvas so it never ends up in the
// painting, exports or snapshots.

import type { Vec3 } from './GpuFluidEngine';
import type { CupView } from './pours';

const toSrgb = (c: number) => {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
};
const rgba = (c: Vec3, alpha = 1, light = 0) =>
  `rgba(${c.map(v => Math.round((toSrgb(v) * (1 - light) + light) * 255)).join(',')},${alpha})`;

// Cup shape, as a share of its height.
const RIM = 0.78;
const BASE = 0.56;
// How far the cup is tipped (radians, clockwise on screen). Like a real pour,
// a full cup only needs a small tip and an emptying cup is tipped further.
const pourAngle = (fill: number) => 0.75 + (1 - fill) * 1.0;
const REST_ANGLE = 0.25;

export class CupOverlay {
  private ctx: CanvasRenderingContext2D | null;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private shown = 0;
  private x = 0;
  private y = 0;
  private angle = REST_ANGLE;
  private mirror = false;
  private last: CupView | null = null;
  private clock = 0;
  private dirty = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }

  resize(w: number, h: number, dpr: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(this.w * dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * dpr));
    this.dirty = true;
  }

  draw(view: CupView | null, dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.clock += dt;
    this.shown += ((view ? 1 : 0) - this.shown) * (1 - Math.exp(-dt * (view ? 16 : 7)));
    const H = Math.max(38, Math.min(66, Math.min(this.w, this.h) * 0.11));

    if (view) {
      const tx = view.x * this.w;
      const ty = view.y * this.h;
      const fresh = !this.last || this.shown < 0.1;
      const k = fresh ? 1 : 1 - Math.exp(-dt * 20);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
      // Keep the cup's body on screen near the left edge by pouring from the other side.
      if (this.x < H * 1.6) this.mirror = true;
      else if (this.x > H * 2.3) this.mirror = false;
      if (fresh) this.angle = view.pose === 'pour' ? REST_ANGLE : Math.PI;
      this.last = view;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.shown < 0.01 || !this.last) {
      if (this.dirty || this.last) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.last = null;
      this.dirty = false;
      return;
    }
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = true;

    // Once the pour stops, the cup tips back up as it fades.
    const v: CupView = view ?? { ...this.last, flow: 'none' };
    const pouring = v.pose === 'pour';
    const wobble = v.flow === 'flick' ? Math.sin(this.clock * 26) * 0.16 : 0;
    const targetAngle = pouring ? (view ? pourAngle(v.fill) : REST_ANGLE) + wobble : Math.PI;
    this.angle += (targetAngle - this.angle) * (1 - Math.exp(-dt * (v.flow === 'flick' ? 30 : 9)));

    const landX = view ? view.x * this.w : this.x;
    const landY = view ? view.y * this.h : this.y;
    const alpha = this.shown * (v.pose === 'lift' ? 1 - Math.max(0, v.lift - 0.35) / 0.65 : 1);
    const rimW = H * RIM;
    const baseW = H * BASE;

    // Where the cup is pinned: the pouring lip, or the middle of the rim of a flipped cup.
    const pinX = this.x;
    const pinY = pouring
      ? this.y - Math.max(H * 0.4, Math.min(H * 1.15, this.y - H * 0.9))
      : this.y - (v.pose === 'lift' ? v.lift * H * 1.3 : 0);
    const side = this.mirror ? -1 : 1;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = alpha;

    // Soft shadow on the canvas.
    ctx.fillStyle = 'rgba(20,16,10,0.13)';
    ctx.beginPath();
    if (pouring) ctx.ellipse(pinX - side * H * 0.45, landY + H * 0.1, H * 0.55, H * 0.15, 0, 0, Math.PI * 2);
    else ctx.ellipse(this.x, landY + H * 0.04, rimW * 0.62 * (1 + (v.pose === 'lift' ? v.lift : 0)), H * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Paint leaving the cup.
    const streamW = Math.max(2.5, Math.min(14, v.width * this.h));
    if (v.flow === 'stream' && pouring) {
      this.stream(v.current.paint.color, pinX, pinY, landX, landY, streamW);
    } else if (v.flow === 'stream' && v.pose === 'lift') {
      // A flipped cup lifted off lets the rest out all at once.
      // It falls as a thick column that narrows on the way down.
      const top = rimW * 0.8 * (1 - v.lift);
      const foot = top * 0.5;
      ctx.beginPath();
      ctx.moveTo(pinX - top / 2, pinY);
      ctx.lineTo(pinX + top / 2, pinY);
      ctx.quadraticCurveTo(pinX + foot / 2, (pinY + landY) / 2, pinX + foot / 2, landY);
      ctx.lineTo(pinX - foot / 2, landY);
      ctx.quadraticCurveTo(pinX - foot / 2, (pinY + landY) / 2, pinX - top / 2, pinY);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(25,22,18,0.2)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = rgba(v.current.paint.color, 0.95);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(pinX, landY, foot * 1.1, foot * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (v.flow === 'drip' && pouring) {
      for (let i = 0; i < 2; i++) {
        const phase = (this.clock * 2.2 + i * 0.5) % 1;
        const dy = phase * phase * (landY - pinY);
        ctx.fillStyle = rgba(v.current.paint.color, 0.95);
        ctx.beginPath();
        ctx.ellipse(pinX, pinY + dy, streamW * 0.55, streamW * (0.7 + phase * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The cup, in its own coordinates: rim centre at 0,0, base at y = H.
    const toCup = () => {
      ctx.translate(pinX, pinY);
      ctx.scale(side, 1);
      ctx.rotate(this.angle);
      if (pouring) ctx.translate(-rimW / 2, 0);
    };
    const local = (draw: () => void) => {
      ctx.save();
      toCup();
      draw();
      ctx.restore();
    };
    const outline = (inset: number) => {
      ctx.beginPath();
      ctx.moveTo(-rimW / 2 + inset, inset * 0.5);
      ctx.lineTo(rimW / 2 - inset, inset * 0.5);
      ctx.lineTo(baseW / 2 - inset, H - inset);
      ctx.lineTo(-baseW / 2 + inset, H - inset);
      ctx.closePath();
    };

    local(() => {
      outline(0);
      ctx.fillStyle = 'rgba(214,226,232,0.2)';
      ctx.fill();
    });

    // Paint inside the cup settles level. A tipped cup is full up to the lip it
    // pours from, with the layer leaving the cup on top; a flipped cup leaks
    // from the bottom layer.
    if (v.fill > 0.01 && v.layers.length) {
      ctx.save();
      toCup();
      outline(1.6);
      ctx.clip();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const ys = this.cornerYs(pinY, pouring, rimW, baseW, H);
      const low = Math.max(...ys) + 1;
      const extent = low - Math.min(...ys);
      const top = pouring ? Math.max(pinY, low - extent * (0.1 + 0.9 * v.fill)) : low - extent * (0.12 + 0.82 * v.fill);
      const depth = low - top;
      const start = Math.max(0, v.layers.indexOf(v.current));
      const total = v.layers.reduce((sum, l) => sum + l.weight, 0) || 1;
      let edge = pouring ? top : low;
      for (let i = 0; i < v.layers.length && depth > 0.5; i++) {
        const layer = v.layers[(start + i) % v.layers.length];
        const band = Math.max(1.5, (layer.weight / total) * depth);
        const y0 = pouring ? edge : Math.max(top, edge - band);
        const y1 = pouring ? Math.min(low, edge + band) : edge;
        if (y1 - y0 <= 0) break;
        ctx.fillStyle = rgba(layer.paint.color, 0.96);
        ctx.fillRect(pinX - H * 3, y0, H * 6, y1 - y0 + 0.6);
        // A faint line between layers, so a white layer still reads on a white canvas.
        ctx.fillStyle = 'rgba(25,22,18,0.16)';
        ctx.fillRect(pinX - H * 3, pouring ? y0 : y1 - 0.4, H * 6, 0.8);
        edge = pouring ? y1 : y0;
      }
      ctx.restore();
    }

    local(() => {
      outline(0);
      // A dark edge under the light one keeps the clear cup visible on white and on black.
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(30,27,22,0.45)';
      ctx.lineWidth = 2.8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(248,246,240,0.92)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // Thick rolled rim and a glint down the side.
      ctx.beginPath();
      ctx.moveTo(-rimW / 2 - 1, 0);
      ctx.lineTo(rimW / 2 + 1, 0);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(30,27,22,0.45)';
      ctx.lineWidth = 4.4;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(248,246,240,0.95)';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-rimW * 0.3, H * 0.12);
      ctx.lineTo(-baseW * 0.32, H * 0.86);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  /** Screen heights of the cup's corners (for levelling the paint inside). */
  private cornerYs(pinY: number, pouring: boolean, rimW: number, baseW: number, H: number) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const shift = pouring ? -rimW / 2 : 0;
    return [[-rimW / 2, 0], [rimW / 2, 0], [baseW / 2, H], [-baseW / 2, H]].map(([x, y]) => pinY + (x + shift) * s + y * c);
  }

  private stream(color: Vec3, fromX: number, fromY: number, toX: number, toY: number, width: number) {
    const ctx = this.ctx as CanvasRenderingContext2D;
    const sway = Math.sin(this.clock * 9) * 1.2;
    const midY = (fromY + toY) / 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.quadraticCurveTo(fromX + sway, midY, toX, toY);
    ctx.strokeStyle = 'rgba(25,22,18,0.2)';
    ctx.lineWidth = width + 1.6;
    ctx.stroke();
    ctx.strokeStyle = rgba(color, 0.97);
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.strokeStyle = rgba(color, 0.4, 0.55);
    ctx.lineWidth = Math.max(1, width * 0.28);
    ctx.beginPath();
    ctx.moveTo(fromX - width * 0.18, fromY + 2);
    ctx.quadraticCurveTo(fromX + sway - width * 0.18, midY, toX - width * 0.18, toY - 2);
    ctx.stroke();
    // Where the stream lands it spreads into a puddle with a ripple.
    ctx.fillStyle = rgba(color, 0.65);
    ctx.beginPath();
    ctx.ellipse(toX, toY, width * 1.5, width * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    const ripple = (this.clock * 2.5) % 1;
    ctx.strokeStyle = rgba(color, 0.35 * (1 - ripple), 0.4);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(toX, toY, width * (1.5 + 2.5 * ripple), width * (0.6 + 1 * ripple), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}
