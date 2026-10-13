// Turns the studio's tools, cup layers and pour modes into engine input.
// Pointer coordinates come in as canvas UV with y pointing DOWN (screen);
// the engine works with y pointing UP, so they're flipped on the way in.

import { ONE_SHOT_POUR_MODES } from '../fluidEngine';
import type { CanvasSurface, PhysicsParams, PourMode, Tool } from '../fluidEngine';
import type { PaintColor } from '../palette';
import { getPaintMaterial } from '../paintMaterials';
import { hexToLinear } from './GpuFluidEngine';
import type { CellOptions, EngineSettings, GpuFluidEngine, PaintSplat, Vec3 } from './GpuFluidEngine';

export interface StudioInput {
  tool: Tool;
  pourMode: PourMode;
  color: PaintColor;
  cupColors: PaintColor[];
  params: PhysicsParams;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const SURFACES: Record<CanvasSurface, string> = {
  white: '#f7f4ee',
  black: '#1b1c20',
  kraft: '#c4a17a',
};

// The turntable slider tops out at 45 RPM.
const TURNTABLE_RAD_PER_S = (45 * 2 * Math.PI) / 60;

/** Map the studio's 0..1 sliders onto the engine's physical settings. */
export function engineSettings(
  params: PhysicsParams,
  surface: CanvasSurface,
  tilt: { x: number; y: number },
  spin: number,
): Partial<EngineSettings> {
  const visc = clamp01(params.viscosity);
  const turb = clamp01(params.turbulence);
  const g = 0.4 + 1.6 * clamp01(params.gravity);
  return {
    damping: 0.4 + 5 * visc,
    curl: (1 - visc) * (0.3 + 1.6 * turb),
    wander: (1 - 0.7 * visc) * (0.3 + 2.2 * turb),
    // Screen y points down; the engine's y points up.
    tilt: [clamp(tilt.x, -1, 1) * g, -clamp(tilt.y, -1, 1) * g],
    // The studio calls positive spin clockwise; the engine counts counter-clockwise.
    spin: -clamp(spin, -1, 1) * TURNTABLE_RAD_PER_S,
    tension: 6 + 18 * clamp01(params.surfaceTension),
    mix: 1.5 * clamp01(params.colorMixing),
    sharpen: 1.6 * (1 - clamp01(params.colorMixing)),
    dryRate: 0.002 + 0.05 * clamp01(params.dryingRate),
    surface: hexToLinear(SURFACES[surface] ?? SURFACES.white),
    gloss: surface === 'black' ? 0.95 : 0.85,
  };
}

const brushSize = (p: PhysicsParams) => 0.035 + 0.025 * clamp01(p.flowRate);
const pourRate = (p: PhysicsParams) => 0.03 + 0.09 * clamp01(p.flowRate);

// ---------- paint layers ----------

export interface Layer {
  paint: PaintSplat;
  flow: number;
  cells: number;
  weight: number;
  light: number;
}

interface Cup {
  layers: Layer[];
  total: number;
  palette: Vec3[];
  cellColor: Vec3;
  cellPower: number;
  cellAmount: number;
}

function layerOf(p: PaintColor): Layer {
  const m = getPaintMaterial(p.material, Boolean(p.metallic));
  const color = hexToLinear(p.hex);
  return {
    paint: {
      color,
      metallic: m.id === 'metallic' || (p.metallic && m.id !== 'pearl') ? 1 : 0,
      pearl: m.id === 'pearl' ? 1 : 0,
      body: clamp01((m.viscosity - 0.5) / 1.5),
      strength: clamp01(m.opacity + 0.04),
    },
    flow: m.flow,
    cells: m.cellResponse * (1 + clamp01(p.silicone ?? 0) * 1.8),
    weight: Math.max(1, p.amount ?? 20),
    light: 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2],
  };
}

function cupOf(input: StudioInput): Cup {
  const paints = input.cupColors.length ? input.cupColors.slice(0, 8) : [input.color];
  const layers = paints.map(layerOf);
  const brightest = layers.reduce((a, b) => (b.light > a.light ? b : a), layers[0]);
  const silicone = Math.max(0, ...paints.map(p => clamp01(p.silicone ?? 0)));
  const p = input.params;
  return {
    layers,
    total: layers.reduce((s, l) => s + l.weight, 0),
    palette: layers.map(l => l.paint.color),
    // Cells show the lightest, heaviest layer (usually the white) coming up through the top.
    cellColor: brightest.paint.color,
    cellPower: clamp(clamp01(p.cellFrequency) * 0.5 + clamp01(p.silicone) * 0.7 + silicone * 0.6, 0, 1.6),
    cellAmount: clamp01(0.2 + clamp01(p.silicone) * 0.6 + silicone * 0.3),
  };
}

function pickLayer(cup: Cup): Layer {
  let r = Math.random() * cup.total;
  for (const l of cup.layers) {
    r -= l.weight;
    if (r <= 0) return l;
  }
  return cup.layers[cup.layers.length - 1];
}

function cellColors(cup: Cup, cellColor = cup.cellColor): Pick<CellOptions, 'cellColor' | 'innerColor' | 'palette'> {
  const others = cup.palette.filter(c => c !== cellColor);
  const innerColor = others.length ? others[Math.floor(Math.random() * others.length)] : cellColor;
  return { cellColor, innerColor, palette: cup.palette };
}

type CupStyle = 'stream' | 'flip' | 'dirty' | 'ring';

/**
 * Paint leaves a layered cup in bands. Each layer's share of the cup sets how
 * long its band lasts. Dirty pours come out uneven and sometimes skip a layer;
 * tree rings come out evenly in order.
 */
class CupSequencer {
  private index = -1;
  private left = 0;

  next(cup: Cup, dt: number, style: CupStyle): Layer {
    const n = cup.layers.length;
    this.left -= dt;
    if (this.left <= 0 || this.index < 0 || this.index >= n) {
      if (style === 'dirty' && n > 1 && Math.random() < 0.2) this.index = Math.floor(Math.random() * n);
      else this.index = (this.index + 1) % n;
      const share = cup.layers[this.index].weight / 20;
      const base = style === 'ring' ? 0.2
        : style === 'flip' ? 0.1 + Math.random() * 0.25
          : style === 'dirty' ? 0.06 + Math.random() * 0.26
            : 0.28;
      this.left = base * share;
    }
    return cup.layers[this.index];
  }
}

// ---------- the director ----------

interface Pointer {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  age: number;
}

type Script = { t: number; run: (t: number, dt: number) => boolean };

/**
 * The cup to draw over the canvas this frame. Positions are canvas UV with y
 * pointing DOWN (screen), sizes are in canvas heights.
 */
export interface CupView {
  /** Where the paint lands. */
  x: number;
  y: number;
  /** pour: tipped over the canvas. flip: upside down on the canvas. lift: a flipped cup being lifted off. */
  pose: 'pour' | 'flip' | 'lift';
  /** 0..1 while a flipped cup is lifted away. */
  lift: number;
  /** stream: a steady pour. drip: drops. flick: shaken droplets. none: nothing leaving the cup. */
  flow: 'stream' | 'drip' | 'flick' | 'none';
  /** Width of the stream. */
  width: number;
  /** 0..1, how much paint is left in the cup. */
  fill: number;
  /** The cup's layers, and the one leaving the cup now. */
  layers: readonly Layer[];
  current: Layer;
}

export class PourDirector {
  private pointers = new Map<number, Pointer>();
  private scripts: Script[] = [];
  private seq = new CupSequencer();
  private torchClock = 0;
  private dripClock = 0;
  private cupCache: { key: unknown[]; cup: Cup } | null = null;
  /** The cup to draw this frame, or null when nothing is being poured. */
  view: CupView | null = null;

  constructor(private engine: GpuFluidEngine) {}

  private show(x: number, y: number, cup: Cup, current: Layer, flow: CupView['flow'], width: number, fill: number, pose: CupView['pose'] = 'pour', lift = 0) {
    this.view = { x, y: 1 - y, pose, lift, flow, width, fill: clamp01(fill), layers: cup.layers, current };
  }

  get busy() {
    return this.scripts.length > 0;
  }

  /** True while a tool is held or a pour is running. */
  get active() {
    return this.pointers.size > 0 || this.scripts.length > 0;
  }

  /** Stop any running pours (used by clear, undo and loading a pour). */
  cancel() {
    this.scripts = [];
    this.pointers.clear();
    this.view = null;
  }

  private cup(input: StudioInput): Cup {
    const key = [input.cupColors, input.color, input.params];
    const c = this.cupCache;
    if (c && c.key.every((k, i) => k === key[i])) return c.cup;
    const cup = cupOf(input);
    this.cupCache = { key, cup };
    return cup;
  }

  /** Returns true when this press changes the paint (so the canvas pushed an undo step). */
  pointerDown(id: number, x: number, y: number, input: StudioInput): boolean {
    if (input.tool === 'tilt') return false;
    const ux = x;
    const uy = 1 - y;
    this.engine.pushUndo();
    if (input.tool === 'pour' && ONE_SHOT_POUR_MODES.has(input.pourMode)) {
      this.startPour(input.pourMode, ux, uy, input);
      return true;
    }
    this.pointers.set(id, { x: ux, y: uy, px: ux, py: uy, vx: 0, vy: 0, age: 0 });
    if (input.tool === 'cell') this.cellTap(ux, uy, input);
    this.torchClock = 0;
    this.dripClock = 0;
    return true;
  }

  pointerMove(id: number, x: number, y: number) {
    const p = this.pointers.get(id);
    if (!p) return;
    p.x = x;
    p.y = 1 - y;
  }

  pointerUp(id: number) {
    this.pointers.delete(id);
  }

  update(dt: number, input: StudioInput) {
    if (dt <= 0) return;
    this.view = null;
    if (this.pointers.size) {
      const cup = this.cup(input);
      for (const ptr of this.pointers.values()) this.applyTool(ptr, dt, input, cup);
    }
    for (let i = this.scripts.length - 1; i >= 0; i--) {
      const s = this.scripts[i];
      s.t += dt;
      if (!s.run(s.t, dt)) this.scripts.splice(i, 1);
    }
  }

  // ---------- held tools ----------

  private applyTool(ptr: Pointer, dt: number, input: StudioInput, cup: Cup) {
    const A = this.engine.aspect;
    const size = brushSize(input.params);
    const dx = ptr.x - ptr.px;
    const dy = ptr.y - ptr.py;
    const moved = Math.hypot(dx * A, dy);
    ptr.age += dt;
    // Smoothed pointer velocity in canvas heights per second.
    ptr.vx += ((dx * A) / dt - ptr.vx) * 0.5;
    ptr.vy += (dy / dt - ptr.vy) * 0.5;
    // Walk along the drag so fast strokes don't leave gaps.
    const steps = clamp(Math.ceil(moved / (size * 0.35)), 1, 24);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      this.toolAt(input, cup, ptr, ptr.px + dx * t, ptr.py + dy * t, dt / steps, s === steps, size);
    }
    ptr.px = ptr.x;
    ptr.py = ptr.y;
  }

  private toolAt(input: StudioInput, cup: Cup, ptr: Pointer, x: number, y: number, dt: number, last: boolean, size: number) {
    const e = this.engine;
    const A = e.aspect;
    const p = input.params;
    const visc = clamp01(p.viscosity);
    switch (input.tool) {
      case 'pour': {
        const rate = pourRate(p);
        // A cup held for a while slowly empties, but never runs dry.
        const fill = 0.35 + 0.55 * Math.exp(-ptr.age / 10);
        if (input.pourMode === 'splatter') {
          if (!last) return;
          this.show(x, y, cup, cup.layers[0], 'flick', size * 0.3, fill);
          // Flicked droplets land around the cup and splash outward a little.
          const count = Math.floor((16 + 30 * clamp01(p.flowRate)) * dt * 2 + Math.random());
          for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = size * (0.4 + 3.2 * Math.random() * Math.random());
            const dropR = size * (0.15 + 0.35 * Math.random());
            const sx = x + (Math.cos(a) * r) / A;
            const sy = y + Math.sin(a) * r;
            e.splatPaint(sx, sy, dropR, pickLayer(cup).paint);
            e.splatForce(sx, sy, dropR * 2.5, 0, 0, 0.12);
          }
          return;
        }
        if (input.pourMode === 'drip') {
          if (!last) return;
          this.show(x, y, cup, this.seq.next(cup, 0, 'stream'), 'drip', size * 0.3, fill);
          this.dripClock -= dt;
          if (this.dripClock > 0) return;
          this.dripClock = (0.32 - 0.22 * clamp01(p.flowRate)) * (0.6 + 0.8 * Math.random());
          const layer = this.seq.next(cup, 0.12, 'stream');
          const jx = ((Math.random() - 0.5) * size * 0.4) / A;
          const jy = (Math.random() - 0.5) * size * 0.4;
          const dropR = size * (0.35 + 0.3 * Math.random());
          e.splatPaint(x + jx, y + jy, dropR, layer.paint);
          // The drop flattens out a little as it lands.
          e.addSource(x + jx, y + jy, dropR * 0.6, dropR * dropR * 40);
          return;
        }
        // Stream: a steady pour from the cup, layer after layer.
        if (!last) {
          e.splatPaint(x, y, size * 0.7, this.seq.next(cup, 0, 'stream').paint);
          return;
        }
        const layer = this.seq.next(cup, dt, 'stream');
        this.show(x, y, cup, layer, 'stream', size * (0.18 + 0.25 * clamp01(p.flowRate)), fill);
        e.splatPaint(x, y, size * 0.75, layer.paint);
        e.addSource(x, y, size * 0.6, rate * layer.flow);
        if (Math.random() < cup.cellPower * layer.cells * 1.2 * dt) {
          const a = Math.random() * Math.PI * 2;
          const r = size * (1.5 + Math.random() * 3);
          e.splatCells(x + (Math.cos(a) * r) / A, y + Math.sin(a) * r, size * 1.2, {
            amount: cup.cellAmount, strength: 0.8, kick: 0.15, ...cellColors(cup),
          });
        }
        return;
      }
      case 'torch': {
        if (!last) return;
        // Heat brings silicone and lower layers up as cells.
        this.torchClock -= dt;
        if (this.torchClock > 0) return;
        const heat = 0.5 + 0.4 * clamp01(p.silicone);
        this.torchClock = 0.07 + (1 - heat) * 0.12;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size * 1.5;
        e.splatCells(x + (Math.cos(a) * r) / A, y + Math.sin(a) * r, size * (1.2 + heat * 1.5), {
          amount: Math.min(1, cup.cellAmount + heat * 0.4),
          strength: 0.55 + heat * 0.45,
          kick: 0.25 + heat * 0.4,
          ...cellColors(cup),
        });
        return;
      }
      case 'scraper': {
        if (!last) return;
        // A wide blade carries the paint in front of it along.
        e.splatForce(x, y, size * 2.2, ptr.vx * 0.9, ptr.vy * 0.9, 0, 0.5 * (1 - visc * 0.3));
        return;
      }
      case 'comb': {
        if (!last) return;
        const speed = Math.hypot(ptr.vx, ptr.vy);
        if (speed < 0.01) return;
        const nx = -ptr.vy / speed;
        const ny = ptr.vx / speed;
        // Five thin tines dragged side by side pull the paint into feathered lines.
        for (let i = -2; i <= 2; i++) {
          const off = i * size * 0.9;
          e.splatForce(x + (nx * off) / A, y + ny * off, size * 0.28, ptr.vx, ptr.vy, 0, 0.45 * (1 - visc * 0.3));
        }
        return;
      }
      case 'blower': {
        if (!last) return;
        const power = 0.6 * (1 - visc * 0.3);
        const speed = Math.hypot(ptr.vx, ptr.vy);
        // Held still, air pushes paint out in a ring; moving, it's a jet that
        // drags paint along and fans it out ahead.
        if (speed < 0.05) {
          e.addSource(x, y, size * 0.4, 0.08 * power, { reach: size * 3 });
        } else {
          e.splatForce(x, y, size * 1.6, ptr.vx * 0.6 * power, ptr.vy * 0.6 * power);
          e.addSource(x, y, size * 0.4, 0.05 * power, { reach: size * 2.5, dir: [ptr.vx, ptr.vy], focus: 4 });
        }
        return;
      }
      default:
        return;
    }
  }

  private cellTap(x: number, y: number, input: StudioInput) {
    const cup = this.cup(input);
    const own = hexToLinear(input.color.hex);
    const size = brushSize(input.params);
    const others = cup.palette.filter(c => c.some((v, i) => Math.abs(v - own[i]) > 0.01));
    this.engine.splatCells(x, y, size * 1.8, {
      amount: clamp01(cup.cellAmount + 0.15),
      strength: 1,
      kick: 0.3,
      cellColor: own,
      innerColor: others.length ? others[Math.floor(Math.random() * others.length)] : own,
      palette: cup.palette,
    });
  }

  // ---------- one-tap pours ----------

  private startPour(mode: PourMode, ox: number, oy: number, input: StudioInput) {
    const e = this.engine;
    const cup = cupOf(input);
    const p = input.params;
    const size = brushSize(p);
    const rate = pourRate(p);
    const seq = new CupSequencer();
    const A = () => e.aspect;

    const streamWidth = size * (0.18 + 0.25 * clamp01(p.flowRate));
    const pourAt = (x: number, y: number, dt: number, style: CupStyle, rateScale: number, sizeScale = 1, fill = 0.6) => {
      const layer = seq.next(cup, dt, style);
      const s = size * sizeScale;
      this.show(x, y, cup, layer, 'stream', streamWidth * Math.sqrt(rateScale), fill);
      e.splatPaint(x, y, s * 0.75, layer.paint);
      e.addSource(x, y, s * 0.6, rate * rateScale * layer.flow);
    };
    const sprinkle = (cx: number, cy: number, radius: number, dt: number, mult: number) => {
      if (cup.cellPower < 0.03 || Math.random() > cup.cellPower * mult * dt) return;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      e.splatCells(cx + (Math.cos(a) * r) / A(), cy + Math.sin(a) * r, size * 2.2, {
        amount: cup.cellAmount, strength: 0.8, kick: 0.2, ...cellColors(cup),
      });
    };
    const blow = (x: number, y: number, a: number, power: number, radial = 0) =>
      e.splatForce(x, y, size * 1.4, Math.cos(a) * power, Math.sin(a) * power, radial);

    let run: Script['run'];
    switch (mode) {
      case 'flip':
        // Flip cup: the cup sits upside down and leaks, then is lifted and the rest rushes out.
        run = (t, dt) => {
          if (t < 2.4) {
            pourAt(ox + ((Math.random() - 0.5) * 0.004) / A(), oy + (Math.random() - 0.5) * 0.004, dt, 'flip', 2.4, 1.4);
            this.show(ox, oy, cup, this.view?.current ?? cup.layers[0], 'none', 0, 1 - 0.3 * (t / 2.4), 'flip');
          } else if (t < 2.75) {
            pourAt(ox, oy, dt, 'flip', 4.5, 1.6);
          }
          if (t >= 2.4 && t < 3.3) {
            const k = (t - 2.4) / 0.9;
            // The cup comes up and the paint left inside rushes out.
            this.show(ox, oy, cup, this.view?.current ?? cup.layers[0], t < 2.75 ? 'stream' : 'none', size * 0.9 * (1 - k), 0.7 * (1 - k * 1.5), 'lift', k);
          }
          if (t > 2.8) sprinkle(ox, oy, 0.25, dt, 2.2);
          return t < 6;
        };
        break;
      case 'dirty':
        // Dirty pour: poured from the cup in a small, uneven circle.
        run = (t, dt) => {
          if (t < 2.6) {
            const a = t * 4.2;
            const r = size * 0.35 * (1 + 0.4 * Math.sin(t * 1.7));
            pourAt(ox + (Math.cos(a) * r) / A(), oy + Math.sin(a) * r, dt, 'dirty', 1.7, 1.2, 1 - t / 2.6);
          }
          if (t > 2.6) sprinkle(ox, oy, 0.22, dt, 1.8);
          return t < 5;
        };
        break;
      case 'ring':
        // Tree ring: the cup circles tightly over one spot, laying even rings.
        run = (t, dt) => {
          if (t < 4.5) {
            const a = t * 7;
            const r = size * 0.25;
            pourAt(ox + (Math.cos(a) * r) / A(), oy + Math.sin(a) * r, dt, 'ring', 1.2, 1, 1 - t / 4.5);
          }
          if (t > 4.5) sprinkle(ox, oy, 0.3, dt, 1.5);
          return t < 6.5;
        };
        break;
      case 'open':
        // Open cup: poured in a widening spiral.
        run = (t, dt) => {
          if (t < 4.2) {
            const k = t / 4.2;
            const a = t * 3.4;
            const r = 0.015 + 0.11 * k;
            pourAt(ox + (Math.cos(a) * r) / A(), oy + Math.sin(a) * r, dt, 'stream', 1.1, 0.9, 1 - k);
          }
          if (t > 4.2) sprinkle(ox, oy, 0.25, dt, 1.5);
          return t < 6;
        };
        break;
      case 'dutch': {
        // Dutch pour: a few puddles, then air blown outward from them in
        // sweeping strokes, pulling the layers into feathered arms.
        const tilt = e.settings.tilt;
        const tiltLen = Math.hypot(tilt[0], tilt[1]);
        const dir = tiltLen > 0.05 ? Math.atan2(tilt[1], tilt[0]) : Math.random() * Math.PI * 2;
        const spots = [0, 1, 2].map(() => ({
          x: ox + ((Math.random() - 0.5) * 0.14) / A(),
          y: oy + (Math.random() - 0.5) * 0.14,
        }));
        const sweeps = 5;
        const angles = Array.from({ length: sweeps }, (_, i) => dir + (i / sweeps) * Math.PI * 2 + (Math.random() - 0.5) * 0.6);
        const thin = 1 - clamp01(p.viscosity) * 0.4;
        run = (t, dt) => {
          const i = Math.floor(t / 0.9);
          if (i < 3) pourAt(spots[i].x, spots[i].y, dt, 'dirty', 1.3, 1, 1 - t / 2.7);
          if (t > 2.9 && t < 6.4) {
            const k = (t - 2.9) / 3.5;
            const sweep = Math.min(sweeps - 1, Math.floor(k * sweeps));
            const local = k * sweeps - sweep;
            const a = angles[sweep] + Math.sin(local * Math.PI) * 0.35;
            const reach = 0.03 + local * 0.22;
            const x = ox + (Math.cos(a) * reach) / A();
            const y = oy + Math.sin(a) * reach;
            // An aimed puff of air drags the puddle out into a feathered arm.
            e.addSource(x, y, 0.015, 0.09 * thin, { reach: 0.1, dir: [Math.cos(a), Math.sin(a)], focus: 8 });
            blow(x, y, a, 1.2 * dt * thin);
            sprinkle(x, y, 0.06, dt, 3);
          }
          return t < 7;
        };
        break;
      }
      case 'swipe': {
        // Swipe: stripes of each layer, then a thin film of the lightest
        // layer dragged across the top. Cells open where the film thins out.
        const n = Math.max(3, cup.layers.length);
        const film: PaintSplat = { ...cup.layers.reduce((a, b) => (b.light > a.light ? b : a)).paint, strength: 0.014 };
        run = (t, dt) => {
          if (t < 3.6) {
            const band = Math.min(n - 1, Math.floor((t / 3.6) * n));
            const local = (t / 3.6) * n - band;
            const y = oy + (band / (n - 1) - 0.5) * 0.4;
            const x = ox + ((local - 0.5) * 0.6) / A();
            const layer = cup.layers[band % cup.layers.length];
            this.show(x, y, cup, layer, 'stream', streamWidth, 1 - t / 3.6);
            e.splatPaint(x, y, size * 1.1, layer.paint);
            e.addSource(x, y, size * 0.8, rate * 0.9 * layer.flow);
          }
          if (t > 3.9 && t < 5.9) {
            const k = (t - 3.9) / 2;
            const x = ox + ((k - 0.5) * 0.75) / A();
            // The film is thick where the swipe starts and thins out as it is
            // dragged, so more of the stripes and more cells show toward the end.
            const thick = 0.045 * (1 - k) * (1 - k) + 0.005;
            for (let i = 0; i < 6; i++) {
              const y = oy + (i / 5 - 0.5) * 0.5;
              // The towel drags the top of the paint along a little.
              e.splatForce(x, y, size * 1.8, 0.18, 0, 0, 0.12);
              e.splatPaint(x, y + (Math.random() - 0.5) * size, size * 1.6, { ...film, strength: thick * (0.4 + Math.random() * 1.2) });
              if (Math.random() < (1 + 3 * cup.cellPower) * (0.4 + k) * dt) {
                e.splatCells(x, y, size * 1.8, { amount: cup.cellAmount, strength: 0.75, kick: 0.12, ...cellColors(cup) });
              }
            }
          }
          return t < 6.6;
        };
        break;
      }
      case 'bloom':
      default: {
        // Bloom: a puddle, then air blown from the middle opens it up and
        // puffs around the edge push the rings out into petals.
        const petals = 5 + Math.floor(Math.random() * 3);
        const twist = Math.random() * Math.PI * 2;
        // Uneven petals: each puff is aimed a little off and blows its own strength.
        const puffs = Array.from({ length: petals }, (_, i) => ({
          a: twist + ((i + (Math.random() - 0.5) * 0.5) / petals) * Math.PI * 2,
          power: 0.5 + Math.random(),
          start: Math.random() * 0.25,
        }));
        const thin = 1 - clamp01(p.viscosity) * 0.4;
        run = (t, dt) => {
          if (t < 2.4) pourAt(ox, oy, dt, 'dirty', 1.5, 1.2, 1 - t / 2.4);
          if (t > 2.6 && t < 5.4) {
            const k = (t - 2.6) / 2.8;
            e.addSource(ox, oy, 0.02, 0.03 * (1 - 0.5 * k) * thin, { reach: 0.3 });
            for (const puff of puffs) {
              if (k < puff.start) continue;
              const r = 0.03 + (k - puff.start) * 0.2;
              const a = puff.a + Math.sin(t * 2 + puff.power * 5) * 0.12;
              e.addSource(ox + (Math.cos(a) * r) / A(), oy + Math.sin(a) * r, 0.02, 0.006 * puff.power * thin, {
                reach: 0.1, dir: [Math.cos(a), Math.sin(a)], focus: 5,
              });
            }
            sprinkle(ox, oy, 0.05 + k * 0.2, dt, 5);
          }
          return t < 6.2;
        };
        break;
      }
    }
    this.scripts.push({ t: 0, run });
  }
}
