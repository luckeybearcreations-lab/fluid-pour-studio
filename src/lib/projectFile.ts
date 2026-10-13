import { CanvasSurface, PhysicsParams, PourMode, Tool } from './fluidEngine';
import { DEFAULT_COLOR, PaintColor } from './palette';
import { normalizePaintMaterial } from './paintMaterials';
import { saveFile } from './native';

export const DEFAULT_PHYSICS: PhysicsParams = {
  viscosity: 0.45,
  flowRate: 0.55,
  gravity: 0.6,
  turbulence: 0.3,
  cellFrequency: 0.35,
  surfaceTension: .62,
  colorMixing: .28,
  dryingRate: .24,
  silicone: .32,
};

export interface FluidProjectData {
  app: 'Lucky Bear Fluid Studio';
  version: 'recovery-2';
  projectName: string;
  artistName: string;
  notes: string;
  color: PaintColor;
  cupColors: PaintColor[];
  tool: Tool;
  pourMode: PourMode;
  params: PhysicsParams;
  tilt: { x: number; y: number };
  spin: number;
  surface: CanvasSurface;
  exportScale: 1 | 2 | 4;
  transparentExport: boolean;
  canvasImage: string;
  savedAt: string;
}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord => value && typeof value === 'object' ? value as UnknownRecord : {};
const text = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const unit = (value: unknown, fallback: number) => {
  const raw = number(value, fallback);
  if (raw <= 1) return clamp(raw, 0, 1);
  return clamp(raw / (raw <= 10 ? 10 : 100), 0, 1);
};

function paint(value: unknown, fallback = DEFAULT_COLOR, index = 0): PaintColor {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
    return { id: `imported-${index}-${value.slice(1)}`, name: `Imported color ${index + 1}`, hex: value };
  }
  const item = record(value);
  const hex = typeof item.hex === 'string' ? item.hex : typeof item.color === 'string' ? item.color : fallback.hex;
  const metallic = item.metallic === undefined ? Boolean(fallback.metallic) : Boolean(item.metallic);
  return {
    id: text(item.id, `imported-${index}-${hex.replace('#', '')}`),
    name: text(item.name, `Imported color ${index + 1}`),
    hex: /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback.hex,
    metallic,
    material: normalizePaintMaterial(item.material, metallic),
    silicone: unit(item.silicone, fallback.silicone ?? 0),
    amount: clamp(number(item.amount, fallback.amount ?? 20), 5, 80),
  };
}

function legacyTool(value: unknown): Tool {
  const tool = typeof value === 'string' ? value.toLowerCase() : '';
  if (tool === 'tilt') return 'tilt';
  if (tool === 'cell' || tool === 'silicone') return 'cell';
  if (tool === 'scraper' || tool === 'knife') return 'scraper';
  if (tool === 'comb') return 'comb';
  if (tool === 'blower') return 'blower';
  if (tool === 'torch') return 'torch';
  return 'pour';
}

function legacyPour(value: unknown): PourMode {
  const mode = typeof value === 'string' ? value.toLowerCase() : '';
  if (mode === 'splatter') return 'splatter';
  if (mode === 'drip') return 'drip';
  if (mode === 'flip' || mode === 'flip cup' || mode === 'flipcup') return 'flip';
  if (mode === 'dirty' || mode === 'dirty pour') return 'dirty';
  if (mode === 'ring' || mode === 'tree ring' || mode === 'treering') return 'ring';
  if (mode === 'dutch' || mode === 'dutch pour') return 'dutch';
  if (mode === 'swipe' || mode === 'swipe pour') return 'swipe';
  if (mode === 'open' || mode === 'open cup' || mode === 'opencup') return 'open';
  if (mode === 'bloom') return 'bloom';
  return 'stream';
}

function physics(value: unknown): PhysicsParams {
  const item = record(value);
  return {
    viscosity: unit(item.viscosity, DEFAULT_PHYSICS.viscosity),
    flowRate: unit(item.flowRate ?? item.flowStrength, DEFAULT_PHYSICS.flowRate),
    gravity: unit(item.gravityStrength ?? (typeof item.gravity === 'number' ? item.gravity : undefined), DEFAULT_PHYSICS.gravity),
    turbulence: unit(item.turbulence, DEFAULT_PHYSICS.turbulence),
    cellFrequency: unit(item.cellFrequency ?? item.cellDensity ?? item.bloomAmount, DEFAULT_PHYSICS.cellFrequency),
    surfaceTension: unit(item.surfaceTension, DEFAULT_PHYSICS.surfaceTension),
    colorMixing: unit(item.colorMixing ?? item.colorMixingStrength, DEFAULT_PHYSICS.colorMixing),
    dryingRate: unit(item.dryingRate ?? item.dryingSpeed, DEFAULT_PHYSICS.dryingRate),
    silicone: unit(item.silicone ?? item.siliconeAmount, DEFAULT_PHYSICS.silicone),
  };
}

export function normalizeFluidProject(value: unknown): FluidProjectData {
  const item = record(value);
  const rawRecipe = Array.isArray(item.cupColors) ? item.cupColors : Array.isArray(item.recipe) ? item.recipe : [];
  const cupColors = rawRecipe.slice(0, 5).map((entry, index) => paint(entry, DEFAULT_COLOR, index));
  const color = paint(item.color, cupColors[0] || DEFAULT_COLOR);
  const rawTilt = record(item.tilt);
  const legacySpin = number(item.spinSpeed, 0);
  const spin = item.spin === undefined ? clamp(legacySpin / 10, -1, 1) : clamp(number(item.spin, 0), -1, 1);
  const surface = item.surface === 'black' || item.surface === 'kraft' ? item.surface : 'white';
  const scale = item.exportScale === 1 || item.exportScale === 4 ? item.exportScale : 2;

  return {
    app: 'Lucky Bear Fluid Studio',
    version: 'recovery-2',
    projectName: text(item.projectName, 'Recovered Fluid Pour'),
    artistName: text(item.artistName, 'Arthur Gustavo'),
    notes: text(item.notes, ''),
    color,
    cupColors: cupColors.length ? cupColors : [color],
    tool: legacyTool(item.tool),
    pourMode: legacyPour(item.pourMode ?? item.pourStyle),
    params: physics(Object.keys(record(item.params)).length ? item.params : item),
    tilt: { x: clamp(number(rawTilt.x, 0), -1, 1), y: clamp(number(rawTilt.y, 0), -1, 1) },
    spin,
    surface,
    exportScale: scale,
    transparentExport: Boolean(item.transparentExport ?? item.transparentBg),
    canvasImage: text(item.canvasImage, ''),
    savedAt: text(item.savedAt, new Date().toISOString()),
  };
}

export function downloadFluidProject(project: FluidProjectData) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const filename = `${project.projectName.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'lucky-bear-fluid-project'}.luckybear.json`;
  void saveFile(blob, filename).catch(() => undefined);
}
