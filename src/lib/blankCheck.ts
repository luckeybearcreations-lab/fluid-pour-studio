/**
 * True when an exported pour is (almost) one flat colour, i.e. nothing was painted.
 * Used before a phone case order so nobody pays for a blank case.
 * The image is shrunk to a small grid; if fewer than 0.5% of its pixels differ
 * noticeably from the most common colour, it counts as blank.
 */
export async function looksBlank(image: Blob): Promise<boolean> {
  if (typeof createImageBitmap !== 'function') return false;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(image); } catch { return false; }
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bitmap.close(); return false; }
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  const data = ctx.getImageData(0, 0, size, size).data;

  // Most common colour, bucketed so JPEG noise doesn't split it.
  const counts = new Map<number, number>();
  let common = 0;
  let best = 0;
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n > best) { best = n; common = key; }
  }
  const r = ((common >> 8) & 15) * 16 + 8;
  const g = ((common >> 4) & 15) * 16 + 8;
  const b = (common & 15) * 16 + 8;

  let different = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) > 48) different++;
  }
  return different < (size * size) * 0.005;
}
