import { PaintMaterial } from './paintMaterials';

// Single source of truth for the studio's paint colors
export interface PaintColor {
  id: string;
  name: string;
  hex: string;
  metallic?: boolean;
  material?: PaintMaterial;
  silicone?: number;
  amount?: number;
}

export const PALETTE: PaintColor[] = [
  { id: 'gold', name: 'Liquid Gold', hex: '#D4A537', metallic: true, material: 'metallic' },
  { id: 'silver', name: 'Sterling Silver', hex: '#C0C7D1', metallic: true, material: 'metallic' },
  { id: 'copper', name: 'Molten Copper', hex: '#B87333', metallic: true, material: 'metallic' },
  { id: 'crimson', name: 'Crimson Flow', hex: '#D7263D' },
  { id: 'cobalt', name: 'Cobalt Deep', hex: '#1F4FD8' },
  { id: 'cadmium', name: 'Cadmium Sun', hex: '#F5C518' },
  { id: 'violet', name: 'Royal Violet', hex: '#7B2FBE' },
  { id: 'emerald', name: 'Emerald Pour', hex: '#0E9F6E' },
  { id: 'burnt', name: 'Burnt Ember', hex: '#E8590C' },
  { id: 'obsidian', name: 'Obsidian', hex: '#17181C' },
  { id: 'titanium', name: 'Titanium White', hex: '#F5F2EC' },
  { id: 'pearl', name: 'Pearl Mist', hex: '#E9DFF2', metallic: true, material: 'pearl' },
];

export const DEFAULT_COLOR = PALETTE[0];

/** Lighten a hex color by amount (0..1) — used for cell centers */
export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + Math.round(255 * amount));
  const g = Math.min(255, ((n >> 8) & 255) + Math.round(255 * amount));
  const b = Math.min(255, (n & 255) + Math.round(255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Darken a hex color by amount (0..1) — used for cell rims */
export function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function blendHex(a: string, b: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  const av = parseInt(a.slice(1), 16);
  const bv = parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(((av >> shift) & 255) * (1 - t) + ((bv >> shift) & 255) * t);
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}

const srgbToLinear = (channel: number) => {
  const value = channel / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
};
const linearToSrgb = (channel: number) => {
  const value = channel <= .0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - .055;
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
};

/** Approximate subtractive pigment mixing by interpolating optical absorbance. */
export function mixPigments(a: string, b: string, amount = .5): string {
  const t = Math.max(0, Math.min(1, amount));
  const av = parseInt(a.slice(1), 16);
  const bv = parseInt(b.slice(1), 16);
  const mixed = [16, 8, 0].map(shift => {
    const ar = Math.max(.012, srgbToLinear((av >> shift) & 255));
    const br = Math.max(.012, srgbToLinear((bv >> shift) & 255));
    const absorbance = -Math.log(ar) * (1 - t) + -Math.log(br) * t;
    return linearToSrgb(Math.exp(-absorbance));
  });
  return `#${((mixed[0] << 16) | (mixed[1] << 8) | mixed[2]).toString(16).padStart(6, '0')}`;
}

export function quantizeHex(hex: string, step = 12): string {
  const value = parseInt(hex.slice(1), 16);
  const quantize = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) / step) * step));
  const r = quantize(16), g = quantize(8), b = quantize(0);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
