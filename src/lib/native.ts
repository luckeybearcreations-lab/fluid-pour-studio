/**
 * Helpers for the Android app (Capacitor). On the web these fall back to the
 * normal browser behavior, so the same components work in both places.
 */
import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });

/**
 * Saves a file for the user. In the browser it downloads; in the Android app
 * (where download links do nothing) it opens the share sheet so the user can
 * save it to Photos, Drive, Files, or send it.
 */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (!isNativeApp()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const written = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  await Share.share({ title: filename, files: [written.uri] });
}
