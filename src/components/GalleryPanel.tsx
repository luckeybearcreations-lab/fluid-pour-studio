import React from 'react';
import { X, Trash2, Download, FolderOpen, ImageOff, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { GalleryItem } from '@/lib/gallery';
import { saveFile } from '@/lib/native';

export type { GalleryItem };

interface Props {
  open: boolean;
  items: GalleryItem[];
  loading: boolean;
  offline: boolean;
  syncing: boolean;
  onClose: () => void;
  onLoad: (item: GalleryItem) => void;
  onDelete: (item: GalleryItem) => void;
  onSync: () => void;
}

const GalleryPanel: React.FC<Props> = ({ open, items, loading, offline, syncing, onClose, onLoad, onDelete, onSync }) => {
  const download = async (item: GalleryItem) => {
    try {
      const res = await fetch(item.full);
      const blob = await res.blob();
      await saveFile(blob, `${item.name.replace(/\s+/g, '-').toLowerCase()}.jpg`);
    } catch {
      // last resort: open in new tab
      window.open(item.full, '_blank');
    }
  };

  const localCount = items.filter(i => i.local).length;

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[380px] bg-zinc-950/95 backdrop-blur border-l border-white/10 z-50 transform transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-widest">Gallery</h2>
            {offline && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 text-[10px] font-medium" title="Cloud unreachable — showing offline copies">
                <CloudOff className="w-3 h-3" /> Offline
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {localCount > 0 && !offline && (
          <div className="mx-5 mt-4 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
            <p className="text-[11px] text-amber-300">
              {localCount} pour{localCount > 1 ? 's' : ''} saved offline
            </p>
            <button
              onClick={onSync}
              disabled={syncing}
              className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500 text-zinc-950 text-[10px] font-semibold hover:bg-amber-400 disabled:opacity-60"
            >
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Sync to cloud
            </button>
          </div>
        )}

        <div className="p-5 overflow-y-auto h-[calc(100%-57px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-amber-500/60" />
              <p className="text-sm">Loading your pours…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 text-zinc-500">
              <ImageOff className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-medium text-zinc-400">No saved pours yet</p>
              <p className="text-xs mt-1 max-w-[220px]">Create something beautiful, then hit Save in the top bar to keep it here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {items.map(item => (
                <div key={item.id} className="group relative rounded-lg overflow-hidden ring-1 ring-white/10 bg-zinc-900">
                  {item.local && (
                    <span className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-950/80 text-orange-400 text-[9px] font-medium" title="Stored on this device only">
                      <CloudOff className="w-2.5 h-2.5" /> Local
                    </span>
                  )}
                  <button className="block w-full" onClick={() => onLoad(item)} title="Load onto canvas">
                    <img src={item.thumb} alt={item.name} loading="lazy" className="w-full aspect-[4/3] object-cover group-hover:opacity-80 transition-opacity" />
                  </button>
                  <div className="p-2">
                    <p className="text-[11px] font-medium text-zinc-200 truncate">{item.name}</p>
                    <p className="text-[10px] text-zinc-500">{item.date}</p>
                    <div className="flex gap-1 mt-1.5">
                      <button
                        onClick={() => onLoad(item)}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-zinc-800 text-[10px] text-zinc-300 hover:bg-amber-500 hover:text-zinc-950 transition-colors"
                      >
                        <FolderOpen className="w-3 h-3" /> Load
                      </button>
                      <button
                        onClick={() => download(item)}
                        className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-white"
                        title="Download"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDelete(item)}
                        className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default GalleryPanel;
