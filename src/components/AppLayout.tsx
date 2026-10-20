import React, { useRef, useState, useEffect, useCallback } from 'react';
import FluidCanvas, { FluidCanvasHandle } from '@/components/FluidCanvas';
import Toolbar from '@/components/Toolbar';
import ColorPalette from '@/components/ColorPalette';
import PhysicsControls from '@/components/PhysicsControls';
import GalleryPanel from '@/components/GalleryPanel';
import StudioNotebook, { PourRecipe } from '@/components/StudioNotebook';
import CanvasControls from '@/components/CanvasControls';
import SpinDock from '@/components/SpinDock';
import { PaywallModal, useProSession } from '@/components/PaywallGate';
import { CanvasSurface, PhysicsParams, PourMode, Tool } from '@/lib/fluidEngine';
import { PaintColor, DEFAULT_COLOR } from '@/lib/palette';
import { GalleryItem, fetchPours, savePour, deletePour, syncLocalPours } from '@/lib/gallery';
import { DEFAULT_PHYSICS, downloadFluidProject, FluidProjectData, normalizeFluidProject } from '@/lib/projectFile';
import { Save, Download, Trash2, Images, PanelLeft, Loader2, CloudOff, Sparkles, BookOpen, WandSparkles, Droplets, Move, CircleDot, Palette, Undo2, Redo2, FolderDown, FolderOpen } from 'lucide-react';
import { isNativeApp } from '@/lib/native';

const AppLayout: React.FC = () => {
  const isPro = useProSession(message => showToast(message));
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState<'save' | 'export'>('save');
  const canvasRef = useRef<FluidCanvasHandle>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [tool, setTool] = useState<Tool>('pour');
  const [pourMode, setPourMode] = useState<PourMode>('stream');
  const [color, setColor] = useState<PaintColor>(DEFAULT_COLOR);
  const [cupColors, setCupColors] = useState<PaintColor[]>([DEFAULT_COLOR]);
  const [params, setParams] = useState<PhysicsParams>(DEFAULT_PHYSICS);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [spin, setSpin] = useState(0);
  const [surface, setSurface] = useState<CanvasSurface>('white');
  const [exportScale, setExportScale] = useState<1 | 2 | 4>(2);
  const [transparentExport, setTransparentExport] = useState(false);
  const [projectName, setProjectName] = useState('Untitled Fluid Pour');
  const [artistName, setArtistName] = useState('Arthur Gustavo');
  const [notes, setNotes] = useState('');
  const [stats, setStats] = useState<{ particles: number; cells: number; unit?: 'particles' | 'percent' }>({ particles: 0, cells: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 2600); };
  const refreshGallery = useCallback(async () => {
    setGalleryLoading(true);
    const { items, offline: off } = await fetchPours();
    setGallery(items); setOffline(off); setGalleryLoading(false);
  }, []);
  const [adChoices, setAdChoices] = useState(false);
  useEffect(() => {
    if (!isNativeApp()) return;
    void import('@/lib/ads').then(async ({ startAds, adPrivacyOptionsRequired }) => {
      await startAds();
      setAdChoices(await adPrivacyOptionsRequired());
    });
  }, []);
  useEffect(() => {
    setSidebarOpen(window.innerWidth >= 1024);
    refreshGallery();
  }, [refreshGallery]);

  const requirePro = (feature: 'save' | 'export', action: () => void) => {
    if (isPro) { action(); return; }
    setPaywallFeature(feature);
    setPaywallOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (saving) return;
    const snap = canvasRef.current?.getSnapshot();
    if (!snap) return;
    setSaving(true);
    try {
      const name = `Pour #${gallery.length + 1}`;
      const { item, offline: savedOffline } = await savePour(name, snap);
      setGallery(prev => [item, ...prev]); setOffline(savedOffline);
      showToast(savedOffline && !isNativeApp() ? 'Cloud unavailable — saved on this device' : 'Saved to your gallery');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Could not save pour'); }
    finally { setSaving(false); }
  }, [gallery.length, saving]);

  const handleLoad = (item: GalleryItem) => {
    canvasRef.current?.loadSnapshot(item.full); setGalleryOpen(false); setTilt({ x: 0, y: 0 }); setSpin(0); showToast(`Loaded ${item.name}`);
  };
  const handleDelete = async (item: GalleryItem) => {
    setGallery(prev => prev.filter(g => g.id !== item.id));
    try { await deletePour(item); } catch { showToast('Could not delete from cloud'); refreshGallery(); }
  };
  const handleSync = async () => {
    if (syncing) return; setSyncing(true);
    try { const n = await syncLocalPours(); showToast(n ? `Synced ${n} pour${n > 1 ? 's' : ''}` : 'Everything is already synced'); await refreshGallery(); }
    finally { setSyncing(false); }
  };
  const handleClear = () => {
    if (!confirmClear) { setConfirmClear(true); window.setTimeout(() => setConfirmClear(false), 3000); return; }
    canvasRef.current?.clear(); setTilt({ x: 0, y: 0 }); setSpin(0); setConfirmClear(false); showToast('Fresh canvas ready');
  };
  const toggleCupColor = (paint: PaintColor) => {
    setCupColors(current => {
      const exists = current.some(item => item.id === paint.id);
      if (exists) {
        const next = current.filter(item => item.id !== paint.id);
        const safe = next.length ? next : [DEFAULT_COLOR];
        setColor(safe[0]);
        return safe;
      }
      if (current.length >= 5) {
        showToast('A pour cup can hold up to five colors');
        return current;
      }
      setColor(paint);
      return [...current, paint];
    });
  };
  const resetCup = () => { setCupColors([DEFAULT_COLOR]); setColor(DEFAULT_COLOR); };
  const updateSelectedPaint = (patch: Partial<PaintColor>) => {
    const updated = { ...color, ...patch };
    setColor(updated);
    setCupColors(current => current.map(paint => paint.id === color.id ? updated : paint));
  };
  const handleUndo = () => showToast(canvasRef.current?.undo() ? 'Undid the last canvas action' : 'Nothing to undo');
  const handleRedo = () => showToast(canvasRef.current?.redo() ? 'Restored the next canvas action' : 'Nothing to redo');
  const handleSaveProject = () => {
    const snapshot = canvasRef.current?.getSnapshot();
    if (!snapshot) return;
    const project: FluidProjectData = {
      app: 'Lucky Bear Fluid Studio', version: 'recovery-2', projectName, artistName, notes,
      color, cupColors, tool, pourMode, params, tilt, spin, surface, exportScale,
      transparentExport, canvasImage: snapshot.full, savedAt: new Date().toISOString(),
    };
    downloadFluidProject(project);
    showToast('Lucky Bear project downloaded');
  };
  const handleLoadProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) { showToast('Project file is too large'); return; }
    try {
      const project = normalizeFluidProject(JSON.parse(await file.text()));
      setProjectName(project.projectName); setArtistName(project.artistName); setNotes(project.notes);
      setColor(project.color); setCupColors(project.cupColors); setTool(project.tool); setPourMode(project.pourMode);
      setParams(project.params); setTilt(project.tilt); setSpin(project.spin); setSurface(project.surface);
      setExportScale(project.exportScale); setTransparentExport(project.transparentExport);
      if (project.canvasImage) canvasRef.current?.loadSnapshot(project.canvasImage);
      showToast('Project loaded safely');
    } catch {
      showToast('That is not a valid Lucky Bear project file');
    }
  };
  const loadRecipe = (recipe: PourRecipe) => {
    setColor(recipe.color);
    setCupColors([recipe.color]);
    setPourMode(recipe.mode);
    setParams({ ...DEFAULT_PHYSICS, ...recipe.params });
    setTool('pour');
    setTilt({ x: 0, y: 0 });
    setSpin(0);
    showToast(`Loaded ${recipe.name}`);
  };
  const surpriseMe = () => {
    const colors = ['#D4A537', '#1F4FD8', '#D7263D', '#7B2FBE', '#0E9F6E', '#B87333'];
    const hex = colors[Math.floor(Math.random() * colors.length)];
    const special = Math.random();
    const material: NonNullable<PaintColor['material']> = special > .72 ? 'metallic' : special > .5 ? 'pearl' : special > .3 ? 'siliconeMix' : 'fluidAcrylic';
    const surpriseColor: PaintColor = { id: `surprise-${hex}`, name: 'Studio Surprise', hex, material, metallic: material === 'metallic' || material === 'pearl', silicone: material === 'siliconeMix' ? .58 : .08, amount: 20 };
    setColor(surpriseColor);
    setCupColors([surpriseColor]);
    setPourMode((['stream', 'splatter', 'drip'] as PourMode[])[Math.floor(Math.random() * 3)]);
    setParams({
      viscosity: .25 + Math.random() * .6,
      flowRate: .35 + Math.random() * .55,
      gravity: .35 + Math.random() * .55,
      turbulence: .15 + Math.random() * .55,
      cellFrequency: .15 + Math.random() * .7,
      surfaceTension: .35 + Math.random() * .55,
      colorMixing: .12 + Math.random() * .58,
      dryingRate: .18 + Math.random() * .48,
      silicone: .15 + Math.random() * .6,
    });
    showToast('A fresh studio recipe is ready');
  };

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="brand-lockup">
          <button onClick={() => setSidebarOpen(o => !o)} className="icon-button lg:hidden" aria-label="Toggle studio controls"><PanelLeft /></button>
          <img className="brand-mark" src="/lucky-bear-mark.webp" alt="" aria-hidden="true" width={38} height={38} />
          <div>
            <div className="flex items-center gap-2"><h1>Lucky Bear</h1><span className="studio-label">Fluid Studio</span></div>
            <p>Paint without limits.</p>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={handleUndo} className="action-button secondary compact" title="Undo last canvas action" aria-label="Undo last canvas action"><Undo2 /></button>
          <button onClick={handleRedo} className="action-button secondary compact" title="Redo canvas action" aria-label="Redo canvas action"><Redo2 /></button>
          <button onClick={surpriseMe} className="action-button secondary" title="Create a random studio recipe" aria-label="Surprise me with a recipe"><WandSparkles /><span className="action-label">Surprise</span></button>
          <button onClick={() => setNotebookOpen(true)} className="action-button secondary" aria-label="Open recipe lab"><BookOpen /><span className="action-label">Recipes</span></button>
          <button onClick={() => setGalleryOpen(true)} className="action-button secondary" aria-label="Open saved pours"><Images /><span className="action-label">Gallery</span>{gallery.length > 0 && <b>{gallery.length}</b>}</button>
          <button onClick={() => projectInputRef.current?.click()} className="action-button secondary" title="Open Lucky Bear project" aria-label="Open Lucky Bear project"><FolderOpen /><span className="action-label">Open</span></button>
          <button onClick={handleSaveProject} className="action-button secondary" title="Download Lucky Bear project" aria-label="Download Lucky Bear project"><FolderDown /><span className="action-label">Project</span></button>
          <button onClick={() => requirePro('export', () => canvasRef.current?.exportPNG(exportScale, transparentExport))} className="action-button secondary" title={`Export ${exportScale}× PNG`} aria-label={`Export ${exportScale}× PNG`}><Download /><span className="action-label">Export</span></button>
          <button onClick={handleClear} className={`action-button secondary ${confirmClear ? 'danger' : ''}`} aria-label={confirmClear ? 'Confirm clear canvas' : 'Clear canvas'}><Trash2 /><span className="action-label">{confirmClear ? 'Confirm' : 'Clear'}</span></button>
          <button onClick={() => requirePro('save', handleSave)} disabled={saving} className="action-button primary">{saving ? <Loader2 className="animate-spin" /> : <Save />}<span>{saving ? 'Saving' : isPro ? 'Save pour' : 'Save pour ✦'}</span></button>
          <input ref={projectInputRef} className="sr-only" type="file" accept=".json,.luckybear.json,application/json" onChange={handleLoadProject} />
        </div>
      </header>

      <div className="studio-body">
        <aside className={`control-rail ${sidebarOpen ? 'open' : ''}`}>
          <div className="rail-scroll">
            <Toolbar tool={tool} onToolChange={setTool} pourMode={pourMode} onPourModeChange={setPourMode} />
            <ColorPalette selected={color} cup={cupColors} onSelect={setColor} onToggleCup={toggleCupColor} onResetCup={resetCup} onUpdateSelected={updateSelectedPaint} />
            <PhysicsControls params={params} onParamsChange={setParams} tilt={tilt} onTiltChange={setTilt} spin={spin} onSpinChange={setSpin} />
            <CanvasControls projectName={projectName} artistName={artistName} notes={notes} surface={surface} exportScale={exportScale} transparentExport={transparentExport} onProjectNameChange={setProjectName} onArtistNameChange={setArtistName} onNotesChange={setNotes} onSurfaceChange={setSurface} onExportScaleChange={setExportScale} onTransparentExportChange={setTransparentExport} />
          </div>
        </aside>

        <main className="canvas-stage">
          <div className="stage-meta">
            <div className="live-status"><span className="live-dot" />Live canvas <i /> {stats.unit === 'percent' ? `${stats.particles}% wet` : `${stats.particles} wet`} <i /> {stats.cells} cells</div>
            <div className="stage-tip"><Sparkles /> Hold and move to pour</div>
          </div>
          <div ref={frameRef} className="canvas-frame">
            <FluidCanvas ref={canvasRef} tool={tool} pourMode={pourMode} color={color} cupColors={cupColors} params={params} tilt={tilt} spin={spin} surface={surface} onTiltChange={setTilt} onStats={(particles, cells, unit) => setStats({ particles, cells, unit })} />
            <SpinDock spin={spin} onSpinChange={setSpin} frameRef={frameRef} />
          </div>
          <div className="stage-footer"><span>{projectName}</span><span>{cupColors.length} paint layers</span><span>{pourMode} pour</span>{offline && !isNativeApp() && <span className="offline"><CloudOff /> device storage</span>}<span className="stage-footer-spacer" />{adChoices && !isPro && <button type="button" className="ad-choices" onClick={() => void import('@/lib/ads').then(({ openAdPrivacyOptions }) => openAdPrivacyOptions())}>Ad choices</button>}<span>{exportScale}× {transparentExport ? 'transparent ' : ''}export ready</span></div>
        </main>
      </div>

      <nav className="mobile-tool-dock" aria-label="Quick studio tools">
        <button className={tool === 'pour' ? 'active' : ''} onClick={() => setTool('pour')} aria-label="Use pour tool"><Droplets /><span>Pour</span></button>
        <button className={tool === 'tilt' ? 'active' : ''} onClick={() => setTool('tilt')} aria-label="Use tilt tool"><Move /><span>Tilt</span></button>
        <button className={tool === 'cell' ? 'active' : ''} onClick={() => setTool('cell')} aria-label="Use cell tool"><CircleDot /><span>Cells</span></button>
        <button onClick={() => setSidebarOpen(true)} aria-label="Open paint and physics controls"><i className="dock-swatch" style={{ background: color.hex }}><Palette /></i><span>Mix</span></button>
        <button className={notebookOpen ? 'active' : ''} onClick={() => setNotebookOpen(true)} aria-label="Open recipe lab"><BookOpen /><span>Recipes</span></button>
      </nav>

      <GalleryPanel open={galleryOpen} items={gallery} loading={galleryLoading} offline={offline} syncing={syncing} onClose={() => setGalleryOpen(false)} onLoad={handleLoad} onDelete={handleDelete} onSync={handleSync} />
      <StudioNotebook open={notebookOpen} color={color} mode={pourMode} params={params} onClose={() => setNotebookOpen(false)} onLoad={loadRecipe} />
      <PaywallModal open={paywallOpen} feature={paywallFeature} onClose={() => setPaywallOpen(false)} />
      {toast && <div className="studio-toast">{toast}</div>}
    </div>
  );
};

export default AppLayout;
