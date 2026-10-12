import { isCloudConfigured, supabase } from '@/lib/supabase';

export interface GalleryItem {
  id: string; name: string; date: string; thumb: string; full: string; local?: boolean;
}

const STORAGE_KEY = 'lbfps_gallery_v2';
const LEGACY_STORAGE_KEY = 'lbfps_gallery_v1';
const BUCKET = 'pour-images';
const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const cleanName = (name: string) => name.replace(/[<>]/g, '').trim().slice(0, 80) || 'Untitled pour';

function readLocal(): GalleryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(i => i?.id && i?.full && i?.thumb).map(i => ({ ...i, local: true }));
  } catch { return []; }
}

function writeLocal(items: GalleryItem[]) {
  try {
    const compact = items.slice(0, 40).map(({ local: _local, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch { return false; }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  if (!b64) throw new Error('Invalid artwork data');
  const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function removeObjects(paths: string[]) {
  if (!paths.length) return;
  await supabase.storage.from(BUCKET).remove(paths).catch(() => undefined);
}

async function uploadPour(name: string, snap: { full: string; thumb: string }): Promise<GalleryItem> {
  if (!isCloudConfigured) throw new Error('Cloud storage is not configured');
  const id = crypto.randomUUID();
  const paths = [`${id}/full.jpg`, `${id}/thumb.jpg`];
  const uploaded: string[] = [];
  try {
    const fullRes = await supabase.storage.from(BUCKET).upload(paths[0], dataUrlToBlob(snap.full), { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (fullRes.error) throw fullRes.error;
    uploaded.push(paths[0]);
    const thumbRes = await supabase.storage.from(BUCKET).upload(paths[1], dataUrlToBlob(snap.thumb), { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (thumbRes.error) throw thumbRes.error;
    uploaded.push(paths[1]);

    const fullUrl = supabase.storage.from(BUCKET).getPublicUrl(paths[0]).data.publicUrl;
    const thumbUrl = supabase.storage.from(BUCKET).getPublicUrl(paths[1]).data.publicUrl;
    const { data, error } = await supabase.from('pours').insert({ id, name: cleanName(name), thumb_url: thumbUrl, full_url: fullUrl }).select('id, name, created_at').single();
    if (error) throw error;
    return { id: data.id, name: data.name, date: formatDate(data.created_at), thumb: thumbUrl, full: fullUrl };
  } catch (error) {
    await removeObjects(uploaded);
    throw error;
  }
}

export async function fetchPours(): Promise<{ items: GalleryItem[]; offline: boolean }> {
  const local = readLocal();
  if (!isCloudConfigured) return { items: local, offline: true };
  try {
    const { data, error } = await supabase.from('pours').select('id, name, thumb_url, full_url, created_at').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const cloud: GalleryItem[] = (data || []).map(row => ({ id: row.id, name: row.name, date: formatDate(row.created_at), thumb: row.thumb_url, full: row.full_url }));
    const cloudIds = new Set(cloud.map(i => i.id));
    return { items: [...local.filter(i => !cloudIds.has(i.id)), ...cloud], offline: false };
  } catch { return { items: local, offline: true }; }
}

export async function savePour(name: string, snap: { full: string; thumb: string }): Promise<{ item: GalleryItem; offline: boolean }> {
  try { return { item: await uploadPour(name, snap), offline: false }; }
  catch {
    const item: GalleryItem = { id: `local-${crypto.randomUUID()}`, name: cleanName(name), date: formatDate(new Date().toISOString()), thumb: snap.thumb, full: snap.full, local: true };
    if (!writeLocal([item, ...readLocal()])) throw new Error('Could not save: local storage is full');
    return { item, offline: true };
  }
}

export async function deletePour(item: GalleryItem): Promise<void> {
  if (item.local) { if (!writeLocal(readLocal().filter(i => i.id !== item.id))) throw new Error('Could not update local gallery'); return; }
  const { error } = await supabase.from('pours').delete().eq('id', item.id);
  if (error) throw error;
  await removeObjects([`${item.id}/full.jpg`, `${item.id}/thumb.jpg`]);
}

export async function syncLocalPours(): Promise<number> {
  if (!isCloudConfigured) return 0;
  const local = readLocal();
  let synced = 0;
  const remaining: GalleryItem[] = [];
  for (const item of local) {
    try { await uploadPour(item.name, { full: item.full, thumb: item.thumb }); synced++; }
    catch { remaining.push(item); }
  }
  writeLocal(remaining);
  return synced;
}
