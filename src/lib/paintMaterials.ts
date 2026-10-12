export type PaintMaterial =
  | 'fluidAcrylic'
  | 'heavyBody'
  | 'metallic'
  | 'pearl'
  | 'siliconeMix'
  | 'pouringMedium'
  | 'glossMedium';

export interface PaintMaterialProfile {
  id: PaintMaterial;
  label: string;
  viscosity: number;
  flow: number;
  cohesion: number;
  drying: number;
  cellResponse: number;
  shine: number;
  opacity: number;
  spread: number;
  density: number;
}

// Material profiles tuned for realistic paint behaviour.
// Baseline (fluidAcrylic) = 1.0 for every dimension.
// heavyBody: noticeably sluggish, stiff, mounds up — very different from fluid.
// metallic: similar viscosity to fluid but heavier, reflective, cohesive.
// pearl: slightly cohesive, iridescent, mid-weight.
// siliconeMix: slick, floaty, strong cell generation.
// pouringMedium: thin as water, spreads aggressively, translucent flood.
// glossMedium: like a clear varnish poured over — flows well, high gloss, low opacity.
export const PAINT_MATERIALS: Record<PaintMaterial, PaintMaterialProfile> = {
  fluidAcrylic: {
    id: 'fluidAcrylic', label: 'Fluid Acrylic',
    viscosity: 1,    flow: 1,    cohesion: 1,    drying: 1,
    cellResponse: 1, shine: .28, opacity: .96,   spread: 1,    density: 1,
  },
  heavyBody: {
    id: 'heavyBody', label: 'Heavy Body',
    // Dramatically thicker: 1.9 viscosity means it resists movement much more.
    // Low flow, very high cohesion (clumps together), dries slightly faster.
    viscosity: 1.9,  flow: .44,  cohesion: 1.55, drying: .88,
    cellResponse: .52, shine: .14, opacity: 1,   spread: .52,  density: 1.38,
  },
  metallic: {
    id: 'metallic', label: 'Metallic',
    // Heavier than fluid, flows reasonably, very cohesive so it stays in distinct pools.
    viscosity: 1.12, flow: .82,  cohesion: 1.38, drying: .88,
    cellResponse: .78, shine: .94, opacity: .99, spread: .84,  density: 1.22,
  },
  pearl: {
    id: 'pearl', label: 'Pearl',
    // Slightly above fluid weight, creamy, moderate cohesion, nice iridescence.
    viscosity: 1.06, flow: .91,  cohesion: 1.24, drying: .88,
    cellResponse: .88, shine: .82, opacity: .88, spread: .90,  density: 1.08,
  },
  siliconeMix: {
    id: 'siliconeMix', label: 'Silicone Mix',
    // Slick: low viscosity, high flow, low cohesion (slides away from other paint),
    // very high cell response (it IS the cell trigger).
    viscosity: .88,  flow: 1.22, cohesion: .92,  drying: .80,
    cellResponse: 2.2, shine: .44, opacity: .92, spread: 1.28, density: .90,
  },
  pouringMedium: {
    id: 'pouringMedium', label: 'Pouring Medium',
    // Almost water-thin: floods across the canvas, low opacity (acts like a carrier),
    // dries slowly (extends wet time for everything beneath it).
    viscosity: .62,  flow: 1.72, cohesion: .72,  drying: 1.28,
    cellResponse: .96, shine: .22, opacity: .68, spread: 1.72, density: .76,
  },
  glossMedium: {
    id: 'glossMedium', label: 'Gloss Medium',
    // Clear-ish: flows well, very glossy, moderately translucent.
    viscosity: .88,  flow: 1.18, cohesion: 1.14, drying: .76,
    cellResponse: .96, shine: .84, opacity: .82, spread: 1.18, density: .90,
  },
};

export const MATERIAL_OPTIONS = Object.values(PAINT_MATERIALS);

export function normalizePaintMaterial(value: unknown, metallic = false): PaintMaterial {
  if (typeof value === 'string' && value in PAINT_MATERIALS) return value as PaintMaterial;
  return metallic ? 'metallic' : 'fluidAcrylic';
}

export function getPaintMaterial(value: unknown, metallic = false): PaintMaterialProfile {
  return PAINT_MATERIALS[normalizePaintMaterial(value, metallic)];
}
