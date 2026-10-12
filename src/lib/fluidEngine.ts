// Lucky Bear Fluid Pour Studio — core physics + rendering engine.
// Pure logic module: no React. The sim lives in a mutable object driven by
// a persistent requestAnimationFrame loop; settled paint bakes permanently
// onto an offscreen "base layer" so nothing ever vanishes.

import { blendHex, darken, lighten, mixPigments, PaintColor, quantizeHex } from './palette';
import { getPaintMaterial, PaintMaterial } from './paintMaterials';

export type PourMode = 'stream' | 'splatter' | 'drip' | 'flip' | 'dirty' | 'ring' | 'dutch' | 'swipe' | 'open' | 'bloom';
export type Tool = 'pour' | 'tilt' | 'cell' | 'scraper' | 'comb' | 'blower' | 'torch';
export type CanvasSurface = 'white' | 'black' | 'kraft';

export const ONE_SHOT_POUR_MODES = new Set<PourMode>(['flip', 'dirty', 'ring', 'dutch', 'swipe', 'open', 'bloom']);

export interface PhysicsParams {
  viscosity: number;   // 0 (thin) .. 1 (thick)
  flowRate: number;    // 0..1
  gravity: number;     // 0..1 tilt strength
  turbulence: number;  // 0..1 ambient energy injected by tools
  cellFrequency: number; // 0..1 chance of spontaneous cells while pouring
  surfaceTension: number; // 0..1 cohesion between wet paint bodies
  colorMixing: number; // 0..1 pigment interaction while colors remain wet
  dryingRate: number; // 0..1 slow studio dry -> accelerated dry
  silicone: number; // 0..1 global cell response multiplier
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  color: string;
  metallic: boolean;
  wet: number;        // 1 fresh -> 0 dry
  settle: number;     // frames spent nearly motionless
  mass: number;       // larger drops carry more momentum
  material: PaintMaterial;
  shine: number;
  opacity: number;
  silicone: number;
  cohesion: number;
  drying: number;
  spread: number;
  thickness: number;
  seed: number;
  edgeContact: number;
  trail: { x: number; y: number }[];
}

interface Cell {
  x: number; y: number;
  r: number; maxR: number;
  color: string;
  innerColor: string;
  age: number; matureAge: number;
  eccentricity: number;
  rotation: number;
  seed: number;
}

export interface Sim {
  particles: Particle[];
  cells: Cell[];
  width: number; height: number;
  tiltX: number; tiltY: number;   // -1..1
  spin: number;                    // -1..1
  spinActual: number;              // eased rotational momentum
  turbEnergy: number;              // decays every frame
  params: PhysicsParams;
  dripClock: number;
  surface: CanvasSurface;
  frame: number;
}

export const MAX_PARTICLES = 2800;
const MAX_TRAIL = 9;

export function createSim(width: number, height: number, params: PhysicsParams): Sim {
  return {
    particles: [], cells: [],
    width, height,
    tiltX: 0, tiltY: 0, spin: 0, spinActual: 0,
    turbEnergy: 0,
    params,
    dripClock: 0,
    surface: 'white',
    frame: 0,
  };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const makeParticle = (
  x: number, y: number, vx: number, vy: number, r: number,
  paint: PaintColor,
): Particle => {
  const material = getPaintMaterial(paint.material, Boolean(paint.metallic));
  const radius = r * (.9 + material.spread * .1);
  return {
    x, y, vx, vy, r: radius,
    mass: Math.max(.62, radius / 10) * material.density,
    color: paint.hex,
    metallic: material.id === 'metallic' || material.id === 'pearl',
    material: material.id,
    shine: material.shine,
    opacity: material.opacity,
    silicone: Math.max(0, Math.min(1, paint.silicone ?? (material.id === 'siliconeMix' ? .62 : .08))),
    cohesion: material.cohesion,
    drying: material.drying,
    spread: material.spread,
    thickness: material.viscosity,
    seed: Math.random() * 1000,
    edgeContact: 0,
    wet: 1,
    settle: 0,
    trail: [],
  };
};

// ---------- Spawning ----------

export function spawnPour(
  sim: Sim,
  x: number,
  y: number,
  paint: PaintColor,
  mode: PourMode,
  gestureX = 0,
  gestureY = 0,
) {
  const flow = sim.params.flowRate;
  const material = getPaintMaterial(paint.material, Boolean(paint.metallic));
  if (ONE_SHOT_POUR_MODES.has(mode)) return;
  if (mode === 'stream') {
    const n = 1 + Math.round(flow * material.flow * 3);
    for (let i = 0; i < n; i++) {
      const r = rand(7, 13) * (0.78 + flow * material.flow * .48);
      sim.particles.push(makeParticle(
        x + rand(-4, 4),
        y + rand(-4, 4),
        gestureX * 0.12 + rand(-0.3, 0.3),
        gestureY * 0.12 + rand(-0.3, 0.3),
        r,
        paint,
      ));
    }
  } else if (mode === 'splatter') {
    const n = 2 + Math.round(flow * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1.5, 6);
      const r = rand(3, 8);
      sim.particles.push(makeParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, r, paint));
    }
    sim.turbEnergy = Math.min(1, sim.turbEnergy + 0.15);
  } else { // drip
    sim.dripClock++;
    if (sim.dripClock % Math.max(2, Math.round(8 - flow * 6)) === 0) {
      const r = rand(12, 20);
      sim.particles.push(makeParticle(x + rand(-2, 2), y, 0, rand(0.5, 1.5), r, paint));
    }
  }
  // Spontaneous cells while pouring
  const cellChance = sim.params.cellFrequency * material.cellResponse * (1 + (paint.silicone ?? 0) * 1.8) * .028;
  if (Math.random() < cellChance) {
    spawnCell(sim, x + rand(-30, 30), y + rand(-30, 30), paint.hex, lighten(paint.hex, .35), .8 + (paint.silicone ?? 0));
  }
}

const weightedLayer = (layers: PaintColor[], fraction: number) => {
  const weights = layers.map(layer => Math.max(1, layer.amount ?? 20));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let target = fraction * total;
  for (let i = 0; i < layers.length; i++) {
    target -= weights[i];
    if (target <= 0) return layers[i];
  }
  return layers[layers.length - 1];
};

export function spawnCupPour(
  sim: Sim,
  x: number,
  y: number,
  layers: PaintColor[],
  mode: Exclude<PourMode, 'stream' | 'splatter' | 'drip'> = 'flip',
) {
  const colors = layers.length ? layers.slice(0, 5) : [{ id: 'fallback', name: 'Titanium White', hex: '#f5f2ec' }];
  const baseCount = mode === 'ring' || mode === 'open' ? 350 : mode === 'bloom' ? 290 : mode === 'dirty' ? 250 : 220;
  const total = baseCount + Math.round(sim.params.flowRate * 170);
  const radiusRange: [number, number] = mode === 'ring' || mode === 'open' ? [5, 9]
    : mode === 'dirty' ? [10, 18]
      : mode === 'dutch' || mode === 'swipe' ? [6, 11]
        : mode === 'bloom' ? [10, 18]
          : [7, 14];
  const directionLength = Math.hypot(sim.tiltX, sim.tiltY);
  const directionX = directionLength > .08 ? sim.tiltX / directionLength : 1;
  const directionY = directionLength > .08 ? sim.tiltY / directionLength : 0;
  for (let i = 0; i < total; i++) {
    const fraction = i / Math.max(1, total - 1);
    const interleaved = mode === 'dirty' || mode === 'dutch' || mode === 'swipe' || mode === 'bloom';
    const layer = weightedLayer(colors, interleaved ? (i * .61803398875) % 1 : fraction);
    const band = colors.indexOf(layer);
    const angle = rand(0, Math.PI * 2);
    let px = x, py = y, vx = 0, vy = 0;
    if (mode === 'ring' || mode === 'open') {
      const ringRadius = (mode === 'open' ? 38 : 10) + band * 12 + fraction * (mode === 'ring' ? 44 : 18) + rand(-4, 4);
      const spiral = angle + fraction * Math.PI * (mode === 'ring' ? 3.8 : .7);
      px += Math.cos(spiral) * ringRadius;
      py += Math.sin(spiral) * ringRadius;
      vx = Math.cos(spiral + .42) * rand(.12, .72);
      vy = Math.sin(spiral + .42) * rand(.12, .72);
    } else if (mode === 'dutch') {
      const across = (fraction - .5) * 150;
      px += -directionY * across + rand(-7, 7);
      py += directionX * across + rand(-7, 7);
      const force = rand(.8, 3.4) * (.65 + sim.params.flowRate);
      vx = directionX * force + rand(-.35, .35);
      vy = directionY * force + rand(-.35, .35);
    } else if (mode === 'swipe') {
      const across = (fraction - .5) * 190;
      px += -directionY * across;
      py += directionX * across;
      vx = directionX * rand(.35, 1.6);
      vy = directionY * rand(.35, 1.6);
    } else if (mode === 'dirty') {
      const offsetAngle = band * 2.18 + rand(-1.15, 1.15);
      const radius = 3 + band * 4 + rand(0, 36);
      px += Math.cos(offsetAngle) * radius + rand(-10, 10);
      py += Math.sin(offsetAngle) * radius + rand(-10, 10);
      const curl = rand(.55, 1.75) * (band % 2 ? -1 : 1);
      vx = -Math.sin(offsetAngle) * curl + rand(-.3, .3);
      vy = Math.cos(offsetAngle) * curl + rand(-.3, .3);
    } else {
      const radius = 6 + band * 9 + rand(-4, 4);
      const burst = rand(.2, mode === 'bloom' ? .72 : 1.18) * (.7 + sim.params.flowRate);
      px += Math.cos(angle) * radius;
      py += Math.sin(angle) * radius;
      vx = Math.cos(angle) * burst;
      vy = Math.sin(angle) * burst;
    }
    sim.particles.push(makeParticle(
      px, py, vx, vy,
      rand(radiusRange[0], radiusRange[1]),
      mode === 'bloom' ? { ...layer, silicone: Math.max(.48, layer.silicone ?? 0) } : layer,
    ));
  }
  if (mode === 'bloom') {
    for (let i = 0; i < 10 + Math.round(sim.params.cellFrequency * 18); i++) {
      const outer = colors[i % colors.length];
      const inner = colors[(i + 1) % colors.length];
      spawnCell(sim, x + rand(-70, 70), y + rand(-70, 70), outer.hex, inner.hex, 1.25 + sim.params.silicone);
    }
  }
  sim.turbEnergy = Math.min(1, sim.turbEnergy + (mode === 'dutch' ? .42 : mode === 'swipe' ? .22 : .3));
}

export const spawnFlipCup = (sim: Sim, x: number, y: number, layers: PaintColor[]) => spawnCupPour(sim, x, y, layers, 'flip');

/** Push paint along a drag segment. comb=true applies 5 parallel tines. */
export function applyScrape(sim: Sim, x: number, y: number, dx: number, dy: number, comb: boolean) {
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const nx = dx / len, ny = dy / len;
  const px = -ny, py = nx; // perpendicular
  const offsets = comb ? [-36, -18, 0, 18, 36] : [0];
  const radius = comb ? 14 : 34;
  const strength = Math.min(len, 14) * (comb ? 0.28 : 0.4);
  const forceScale = 1 - sim.params.viscosity * 0.55;

  for (const p of sim.particles) {
    for (const off of offsets) {
      const cx = x + px * off, cy = y + py * off;
      const ddx = p.x - cx, ddy = p.y - cy;
      const d = Math.hypot(ddx, ddy);
      if (d < radius + p.r) {
        const fall = 1 - d / (radius + p.r);
        p.vx += nx * strength * fall * forceScale;
        p.vy += ny * strength * fall * forceScale;
        p.settle = 0;
        p.wet = Math.min(1, p.wet + 0.2); // dragging re-wets paint
        break;
      }
    }
  }
  sim.turbEnergy = Math.min(1, sim.turbEnergy + 0.03);
}

export function applyBlower(sim: Sim, x: number, y: number, dx: number, dy: number) {
  const gesture = Math.hypot(dx, dy);
  const radius = 170;
  for (const p of sim.particles) {
    const rx = p.x - x, ry = p.y - y;
    const distance = Math.hypot(rx, ry);
    if (distance >= radius + p.r) continue;
    const falloff = 1 - distance / (radius + p.r);
    const directionX = gesture > 1 ? dx / gesture : rx / Math.max(1, distance);
    const directionY = gesture > 1 ? dy / gesture : ry / Math.max(1, distance);
    const force = (0.6 + Math.min(gesture, 18) * 0.14) * falloff * (1 - sim.params.viscosity * 0.55);
    p.vx += directionX * force;
    p.vy += directionY * force;
    p.settle = 0;
    p.wet = Math.min(1, p.wet + 0.12);
  }
  sim.turbEnergy = Math.min(1, sim.turbEnergy + 0.08);
}

export function applyTorch(sim: Sim, x: number, y: number, color: string) {
  const nearby = sim.cells.filter(cell => Math.hypot(cell.x - x, cell.y - y) < 90);
  if (nearby.length) {
    for (const cell of nearby) {
      cell.maxR = Math.min(88, cell.maxR + 7);
      cell.age = Math.max(0, cell.age - 18);
    }
  } else {
    const nearbyPaint = sim.particles
      .filter(particle => Math.hypot(particle.x - x, particle.y - y) < 110)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    const outer = nearbyPaint[0]?.color || color;
    const inner = nearbyPaint.find(particle => particle.color !== outer)?.color || lighten(outer, .38);
    for (let i = 0; i < 3; i++) {
      spawnCell(sim, x + rand(-22, 22), y + rand(-22, 22), outer, inner, 1 + sim.params.silicone * .7);
    }
  }
  sim.turbEnergy = Math.min(1, sim.turbEnergy + 0.04);
}

// ---------- Physics step ----------

export function step(sim: Sim, bakeCtx: CanvasRenderingContext2D) {
  const { params } = sim;
  sim.frame++;
  const visc = params.viscosity;
  // Heavy paint loses momentum faster; thin paint coasts longer
  const damp = 0.988 - visc * 0.072;
  const forceScale = 1 - visc * 0.65;
  const g = params.gravity * 0.22;
  const cx = sim.width / 2, cy = sim.height / 2;
  // A real turntable accelerates and coasts instead of snapping between speeds.
  const spinEase = sim.spin === 0 ? 0.055 : 0.025;
  sim.spinActual += (sim.spin - sim.spinActual) * spinEase;
  if (Math.abs(sim.spinActual) < 0.002 && sim.spin === 0) sim.spinActual = 0;
  const forcesActive =
    Math.abs(sim.tiltX) > 0.04 || Math.abs(sim.tiltY) > 0.04 ||
    Math.abs(sim.spinActual) > 0.02 || sim.turbEnergy > 0.05;

  applySurfaceTension(sim);

  // Grow cells and push paint outward to carve craters
  for (let i = sim.cells.length - 1; i >= 0; i--) {
    const c = sim.cells[i];
    c.age++;
    c.r += (c.maxR - c.r) * 0.045;
    if (c.age < c.matureAge * 0.6) {
      const ring = c.r + 18;
      for (const p of sim.particles) {
        const dx = p.x - c.x, dy = p.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.5 && d < ring) {
          const push = (1 - d / ring) * 0.5 * forceScale;
          p.vx += (dx / d) * push;
          p.vy += (dy / d) * push;
          p.settle = 0;
        }
      }
    }
    if (c.age >= c.matureAge) {
      bakeCell(bakeCtx, c);
      sim.cells.splice(i, 1);
    }
  }

  for (let i = sim.particles.length - 1; i >= 0; i--) {
    const p = sim.particles[i];
    // Wet paint flows more; drying paint gets sticky — extra damping once below 0.35 wet
    const wetDamp = p.wet < 0.35 ? damp * (0.92 + p.wet * 0.23) : damp;
    let fx = sim.tiltX * g * forceScale;
    let fy = sim.tiltY * g * forceScale;

    if (Math.abs(sim.spinActual) > 0.02) {
      const dx = p.x - cx, dy = p.y - cy;
      const s = sim.spinActual * 0.00135 * forceScale;
      const centrifugal = Math.abs(sim.spinActual) * 0.00024 * forceScale;
      fx += -dy * s + dx * centrifugal;
      fy += dx * s + dy * centrifugal;
    }

    if (sim.turbEnergy > 0.01) {
      const turbulence = .18 + params.turbulence * .72;
      fx += (Math.random() - 0.5) * sim.turbEnergy * turbulence * forceScale;
      fy += (Math.random() - 0.5) * sim.turbEnergy * turbulence * forceScale;
    }

    const materialDrag = Math.max(.82, Math.min(.998, 1 - (p.thickness - 1) * .038));
    p.vx = (p.vx + fx / p.mass) * wetDamp * materialDrag;
    p.vy = (p.vy + fy / p.mass) * wetDamp * materialDrag;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 11) { p.vx = (p.vx / sp) * 11; p.vy = (p.vy / sp) * 11; }
    p.x += p.vx;
    p.y += p.vy;

    // Edge pooling — paint creeps along the rim; dead-stop absorption, no micro-bouncing
    p.edgeContact *= .88;
    if (p.x < p.r) {
      p.x = p.r;
      p.vx = Math.abs(p.vx) * .04;   // absorb almost all normal momentum
      p.vy *= .96;
      p.edgeContact = 1;
    }
    if (p.x > sim.width - p.r) {
      p.x = sim.width - p.r;
      p.vx = -Math.abs(p.vx) * .04;
      p.vy *= .96;
      p.edgeContact = 1;
    }
    if (p.y < p.r) {
      p.y = p.r;
      p.vy = Math.abs(p.vy) * .04;
      p.vx *= .96;
      p.edgeContact = 1;
    }
    if (p.y > sim.height - p.r) {
      p.y = sim.height - p.r;
      p.vy = -Math.abs(p.vy) * .04;
      p.vx *= .96;
      p.edgeContact = 1;
    }
    // Paint grows laterally as it pools at the edge — faster for thin/high-spread paints
    if (p.edgeContact > .2) p.r = Math.min(32, p.r + .012 * p.spread * (1.4 - p.thickness * .3));

    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > MAX_TRAIL) p.trail.shift();

    // S-curve drying: paint stays wet a long time, then sets fast once it passes 0.28.
    // The crossover makes it behave like real acrylic — long open time, then quick lock.
    const wetThreshold = p.wet < 0.28 ? 3.2 : (p.wet > 0.72 ? 0.55 : 1.0);
    p.wet = Math.max(0, p.wet - (.00042 + params.dryingRate * .00195) * p.drying * wetThreshold);

    // Settling: only when nothing is agitating the canvas
    const speed = Math.hypot(p.vx, p.vy);
    if (speed < 0.07 && !forcesActive) p.settle++;
    else p.settle = 0;

    const settleLimit = 90 + Math.round((1 - params.dryingRate) * 210);
    if (p.settle > settleLimit || p.wet <= 0) {
      bakeParticle(bakeCtx, p);
      sim.particles.splice(i, 1);
    }
  }

  // Ambient turbulence decays — paint reliably comes to rest
  sim.turbEnergy *= 0.955;
  if (sim.turbEnergy < 0.005) sim.turbEnergy = 0;

  // Hard cap: bake slowest particles first
  if (sim.particles.length > MAX_PARTICLES) {
    sim.particles.sort((a, b) => (Math.abs(b.vx) + Math.abs(b.vy)) - (Math.abs(a.vx) + Math.abs(a.vy)));
    while (sim.particles.length > MAX_PARTICLES) {
      const p = sim.particles.pop()!;
      bakeParticle(bakeCtx, p);
    }
  }
  while (sim.cells.length > 80) {
    const oldest = sim.cells.shift();
    if (oldest) bakeCell(bakeCtx, oldest);
  }
}

/** Lightweight spatial-hash cohesion gives wet drops surface tension without O(n²) work. */
function applySurfaceTension(sim: Sim) {
  // Finer grid (28px) catches small drip particles that the old 34px grid missed
  const size = 28;
  const grid = new Map<string, Particle[]>();
  let generatedCells = 0;
  for (const p of sim.particles) {
    const gx = Math.floor(p.x / size), gy = Math.floor(p.y / size);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const nearby = grid.get(`${gx + ox},${gy + oy}`);
      if (!nearby) continue;
      for (const q of nearby) {
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const contact = p.r + q.r;
        // Same-color paint coheres more strongly — it wants to merge into one body.
        // Different-color paint has weaker pull so colors stay visually distinct.
        const sameColor = p.color === q.color;
        const baseCohesion = Math.max(.45, (p.cohesion + q.cohesion) * .5) * (.7 + sim.params.surfaceTension * .6);
        const cohesion = sameColor ? baseCohesion * 1.28 : baseCohesion * .78;
        if (d > contact * (1.35 + cohesion * .35)) continue;
        const nx = dx / d, ny = dy / d;
        if (d < contact * 0.72) {
          const push = (contact * 0.72 - d) * 0.007;
          p.vx -= nx * push; p.vy -= ny * push;
          q.vx += nx * push; q.vy += ny * push;
        } else {
          const pull = (1 - d / (contact * (1.35 + cohesion * .35))) * .012 * (.25 + sim.params.viscosity) * cohesion;
          p.vx += nx * pull; p.vy += ny * pull;
          q.vx -= nx * pull; q.vy -= ny * pull;
        }
        const blend = 0.007 * (p.wet + q.wet);
        const avx = (p.vx + q.vx) / 2, avy = (p.vy + q.vy) / 2;
        p.vx += (avx - p.vx) * blend; p.vy += (avy - p.vy) * blend;
        q.vx += (avx - q.vx) * blend; q.vy += (avy - q.vy) * blend;
        // Color mixing: only while both drops are still very wet (>0.6),
        // and much weaker per-step so colors don't grey out prematurely.
        if (sim.params.colorMixing > .01 && d < contact * 1.02
            && p.wet > .6 && q.wet > .6
            && (sim.frame + Math.floor(p.seed + q.seed)) % 5 === 0
            && p.color !== q.color) {
          const wetContact = Math.min(p.wet, q.wet);
          const mixStrength = sim.params.colorMixing * wetContact * .028;
          const pigment = mixPigments(p.color, q.color, .5);
          p.color = quantizeHex(blendHex(p.color, pigment, mixStrength));
          q.color = quantizeHex(blendHex(q.color, pigment, mixStrength));
        }
        const silicone = Math.max(p.silicone, q.silicone) * sim.params.silicone;
        if (silicone > .08 && generatedCells < 2 && sim.cells.length < 18 && d < contact * .92 && (sim.frame + Math.floor(p.seed * 7 + q.seed * 11)) % 601 === 0) {
          spawnCell(sim, (p.x + q.x) / 2, (p.y + q.y) / 2, p.color, q.color, .65 + silicone * 1.25);
          generatedCells++;
        }
      }
    }
    const key = `${gx},${gy}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(p); else grid.set(key, [p]);
  }
}

// ---------- Baking (permanent layer) ----------

function organicBlobPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  seed: number,
  stretchX = 1,
  stretchY = 1,
) {
  const points = 24;
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < points; i++) {
    const angle = i / points * Math.PI * 2;
    // Three harmonics give a more convincingly irregular paint blob shape —
    // low freq for overall lobe, mid for ripples, high for fine edge texture.
    const wobble = 1
      + Math.sin(angle * 3 + seed) * .058
      + Math.sin(angle * 7 - seed * .71) * .028
      + Math.sin(angle * 13 + seed * .44) * .012;
    positions.push({ x: x + Math.cos(angle) * radius * wobble * stretchX, y: y + Math.sin(angle) * radius * wobble * stretchY });
  }
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const current = positions[i];
    const next = positions[(i + 1) % points];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    if (i === 0) ctx.moveTo(midX, midY);
    else ctx.quadraticCurveTo(current.x, current.y, midX, midY);
  }
  ctx.closePath();
}

function bakeParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  if (p.trail.length > 1) {
    // Tapered trail: wide at head, narrows to a thin tail — like real dragged paint.
    const tl = p.trail.length;
    for (let i = 0; i < tl - 1; i++) {
      const t = i / (tl - 1);           // 0 = tail end, 1 = head
      const segW = p.r * (.42 + t * 1.18);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = p.opacity * (.62 + t * .32);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = segW;
      ctx.beginPath();
      ctx.moveTo(p.trail[i].x, p.trail[i].y);
      ctx.lineTo(p.trail[i + 1].x, p.trail[i + 1].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = p.opacity * .92;
  ctx.fillStyle = p.color;
  organicBlobPath(ctx, p.x, p.y, p.r * 1.08, p.seed, 1 + p.edgeContact * .18, 1 - p.edgeContact * .08);
  ctx.fill();
  const grad = ctx.createRadialGradient(p.x - p.r * .24, p.y - p.r * .3, p.r * .06, p.x, p.y, p.r * 1.08);
  grad.addColorStop(0, lighten(p.color, .06 + p.shine * .08));
  grad.addColorStop(.2, p.color);
  grad.addColorStop(.84, p.color);
  grad.addColorStop(1, darken(p.color, .06 + p.thickness * .018));
  ctx.fillStyle = grad;
  ctx.globalAlpha = p.opacity * .42;
  organicBlobPath(ctx, p.x, p.y, p.r, p.seed, 1 + p.edgeContact * .18, 1 - p.edgeContact * .08);
  ctx.fill();
  if (p.shine > .25) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .035 + p.shine * .08;
    const sheen = ctx.createRadialGradient(p.x - p.r * .32, p.y - p.r * .38, 0, p.x - p.r * .18, p.y - p.r * .2, p.r * .9);
    sheen.addColorStop(0, '#ffffff');
    sheen.addColorStop(.28, 'rgba(255,255,255,.32)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    organicBlobPath(ctx, p.x, p.y, p.r * .94, p.seed);
    ctx.fill();
  }
  ctx.restore();
}

export function spawnCell(sim: Sim, x: number, y: number, color: string, innerColor = lighten(color, .35), strength = 1) {
  sim.cells.push({
    x, y, r: 4,
    // Longer mature age: cells open slowly like real silicone-driven lacing
    maxR: rand(18, 48) * Math.max(.65, strength),
    color,
    innerColor,
    age: 0,
    matureAge: rand(200, 380),
    eccentricity: rand(.78, 1.38),
    rotation: rand(0, Math.PI),
    seed: Math.random() * 1000,
  });
}

function bakeCell(ctx: CanvasRenderingContext2D, c: Cell) {
  drawCellShape(ctx, c, 1);
}

function drawCellShape(ctx: CanvasRenderingContext2D, c: Cell, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(c.x, c.y);
  ctx.rotate(c.rotation);
  ctx.scale(c.eccentricity, 1 / Math.sqrt(c.eccentricity));
  const grad = ctx.createRadialGradient(-c.r * .12, -c.r * .16, 0, 0, 0, c.r);
  grad.addColorStop(0, lighten(c.innerColor, .22));
  grad.addColorStop(.48, c.innerColor);
  grad.addColorStop(.62, lighten(c.color, .1));
  grad.addColorStop(.86, c.color);
  grad.addColorStop(1, darken(c.color, .34));
  ctx.fillStyle = grad;
  organicBlobPath(ctx, 0, 0, c.r, c.seed);
  ctx.fill();
  ctx.strokeStyle = darken(c.color, 0.4);
  ctx.lineWidth = Math.max(1, c.r * .045);
  ctx.globalAlpha = alpha * 0.7;
  ctx.stroke();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = lighten(c.color, .42);
  ctx.lineWidth = Math.max(.7, c.r * .042);
  ctx.globalAlpha = alpha * .2;
  ctx.beginPath();
  ctx.ellipse(-c.r * .06, -c.r * .08, c.r * .72, c.r * .66, 0, .08, Math.PI * 1.46);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = darken(c.innerColor, .5);
  ctx.lineWidth = Math.max(.7, c.r * .03);
  ctx.globalAlpha = alpha * .28;
  ctx.beginPath();
  ctx.ellipse(0, 0, c.r * .48, c.r * .43, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------- Rendering ----------

const spriteCache = new Map<string, HTMLCanvasElement>();

function getBlobSprite(particle: Particle): HTMLCanvasElement {
  const color = quantizeHex(particle.color);
  const wetBand = Math.round(particle.wet * 3);
  const key = `${color}-${particle.material}-${wetBand}`;
  let sprite = spriteCache.get(key);
  if (!sprite) {
    if (spriteCache.size > 160) spriteCache.clear();
    sprite = document.createElement('canvas');
    sprite.width = 112; sprite.height = 112;
    const sctx = sprite.getContext('2d')!;
    const wetShine = particle.shine * (.18 + wetBand * .14);
    const grad = sctx.createRadialGradient(43, 39, 3, 56, 56, 50);
    grad.addColorStop(0, lighten(color, .07 + wetShine * .12));
    grad.addColorStop(.22, color);
    grad.addColorStop(.82, color);
    grad.addColorStop(.96, darken(color, .045 + particle.thickness * .012));
    grad.addColorStop(1, color + '00');
    sctx.fillStyle = grad;
    organicBlobPath(sctx, 56, 56, 51, particle.seed);
    sctx.fill();
    sctx.save();
    organicBlobPath(sctx, 56, 56, 51, particle.seed);
    sctx.clip();
    if (wetShine > .18) {
      sctx.globalCompositeOperation = 'screen';
      const gloss = sctx.createRadialGradient(38, 32, 0, 42, 38, 34);
      gloss.addColorStop(0, `rgba(255,255,255,${Math.min(.36, .08 + wetShine * .3)})`);
      gloss.addColorStop(.32, `rgba(255,255,255,${.02 + wetShine * .05})`);
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      sctx.fillStyle = gloss;
      sctx.fillRect(0, 0, 112, 112);
    }
    if (particle.material === 'metallic') {
      const sheen = sctx.createLinearGradient(16, 13, 94, 96);
      sheen.addColorStop(0, 'rgba(255,255,255,.5)'); sheen.addColorStop(.28, 'rgba(255,255,255,0)'); sheen.addColorStop(.62, 'rgba(255,230,160,.24)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
      sctx.fillStyle = sheen; sctx.fillRect(0, 0, 112, 112);
    } else if (particle.material === 'pearl') {
      const pearl = sctx.createLinearGradient(12, 96, 98, 18);
      pearl.addColorStop(0, 'rgba(96,225,255,.16)');
      pearl.addColorStop(.45, 'rgba(255,255,255,.24)');
      pearl.addColorStop(1, 'rgba(255,112,224,.14)');
      sctx.fillStyle = pearl; sctx.fillRect(0, 0, 112, 112);
    }
    sctx.restore();
    spriteCache.set(key, sprite);
  }
  return sprite;
}

function drawWetConnections(ctx: CanvasRenderingContext2D, sim: Sim) {
  const size = 42;
  const grid = new Map<string, Particle[]>();
  ctx.save();
  ctx.lineCap = 'round';
  for (const particle of sim.particles) {
    const gx = Math.floor(particle.x / size), gy = Math.floor(particle.y / size);
    let links = 0;
    for (let ox = -1; ox <= 1 && links < 5; ox++) for (let oy = -1; oy <= 1 && links < 5; oy++) {
      const nearby = grid.get(`${gx + ox},${gy + oy}`);
      if (!nearby) continue;
      for (let i = nearby.length - 1; i >= 0 && links < 5; i--) {
        const other = nearby[i];
        const distance = Math.hypot(other.x - particle.x, other.y - particle.y);
        const contact = particle.r + other.r;
        if (distance > contact * 1.22) continue;
        const samePigment = particle.color === other.color;
        ctx.globalAlpha = Math.min(particle.opacity, other.opacity) * (samePigment ? .72 : .12 + sim.params.colorMixing * .18);
        ctx.strokeStyle = samePigment ? particle.color : mixPigments(particle.color, other.color, .5);
        ctx.lineWidth = Math.min(particle.r, other.r) * (samePigment ? 1.65 : 1.12);
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(other.x, other.y);
        ctx.stroke();
        links++;
      }
    }
    const key = `${gx},${gy}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(particle); else grid.set(key, [particle]);
  }
  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, sim: Sim, transparent = false) {
  ctx.clearRect(0, 0, sim.width, sim.height);
  if (!transparent) {
    const ground = ctx.createLinearGradient(0, 0, sim.width, sim.height);
    if (sim.surface === 'black') {
      ground.addColorStop(0, '#25262a');
      ground.addColorStop(0.52, '#111216');
      ground.addColorStop(1, '#050609');
    } else if (sim.surface === 'kraft') {
      ground.addColorStop(0, '#c9a97c');
      ground.addColorStop(0.52, '#b88f5f');
      ground.addColorStop(1, '#977047');
    } else {
      ground.addColorStop(0, '#f9f6ef');
      ground.addColorStop(0.52, '#f1ede4');
      ground.addColorStop(1, '#e4ded2');
    }
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, sim.width, sim.height);
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = sim.surface === 'black' ? '#777b84' : sim.surface === 'kraft' ? '#6f4d2f' : '#9e917f';
    ctx.lineWidth = 0.55;
    for (let y = 5; y < sim.height; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(sim.width, y + Math.sin(y * 0.13) * 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.drawImage(base, 0, 0);

  // Neighbor bridges turn particle samples into continuous wet acrylic fields.
  drawWetConnections(ctx, sim);

  // Active cells sit on top of dried paint, under live paint
  for (const c of sim.cells) {
    drawCellShape(ctx, c, Math.min(1, c.age / 30));
  }

  // Live paint: connected viscous ribbons with velocity-stretched glossy heads.
  for (const p of sim.particles) {
    const sprite = getBlobSprite(p);
    const tl = p.trail.length;
    ctx.save();
    ctx.globalAlpha = p.opacity * .86;
    ctx.fillStyle = p.color;
    organicBlobPath(ctx, p.x, p.y, p.r * 1.12, p.seed, 1 + p.edgeContact * .18, 1 - p.edgeContact * .08);
    ctx.fill();
    ctx.restore();
    if (tl > 1) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = p.opacity * .86;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.r * (1.28 + sim.params.viscosity * .5);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(p.trail[0].x, p.trail[0].y);
      for (let i = 1; i < tl; i++) ctx.lineTo(p.trail[i].x, p.trail[i].y);
      ctx.stroke();
      if (p.shine > .15 && p.wet > .18) {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = p.wet * (.035 + p.shine * .12);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(.7, p.r * .11);
        ctx.translate(-p.r * .12, -p.r * .12);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (let i = 0; i < tl - 1; i++) {
      const t = p.trail[i];
      const f = (i + 1) / tl;
      const tr = p.r * (0.35 + f * 0.55);
      ctx.globalAlpha = p.opacity * (0.08 + f * 0.16);
      ctx.drawImage(sprite, t.x - tr, t.y - tr, tr * 2, tr * 2);
    }
    const speed = Math.hypot(p.vx, p.vy);
    const stretch = 1 + Math.min(.65, speed * .08) * (1 - sim.params.viscosity * .45);
    const angle = Math.atan2(p.vy, p.vx);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.scale(stretch, 1 / Math.sqrt(stretch));
    const edgeStretch = 1 + p.edgeContact * .22;
    ctx.scale(edgeStretch, 1 / Math.sqrt(edgeStretch));
    ctx.globalAlpha = p.opacity * .52; ctx.drawImage(sprite, -p.r * 1.2, -p.r * 1.2, p.r * 2.4, p.r * 2.4); ctx.restore();
  }
  ctx.globalAlpha = 1;
}
