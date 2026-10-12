import React from 'react';
import { CanvasSurface } from '@/lib/fluidEngine';
import { FileImage, Layers3 } from 'lucide-react';

interface Props {
  projectName: string;
  artistName: string;
  notes: string;
  surface: CanvasSurface;
  exportScale: 1 | 2 | 4;
  transparentExport: boolean;
  onProjectNameChange: (value: string) => void;
  onArtistNameChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSurfaceChange: (value: CanvasSurface) => void;
  onExportScaleChange: (value: 1 | 2 | 4) => void;
  onTransparentExportChange: (value: boolean) => void;
}

const SURFACES: { id: CanvasSurface; label: string; color: string }[] = [
  { id: 'white', label: 'White', color: '#f4f1ea' },
  { id: 'black', label: 'Black', color: '#111216' },
  { id: 'kraft', label: 'Kraft', color: '#b88f5f' },
];

const CanvasControls: React.FC<Props> = (props) => (
  <section className="control-section project-controls">
    <div className="section-heading"><span>04</span><h2>Project &amp; Canvas</h2></div>
    <label className="project-field"><span>Painting title</span><input value={props.projectName} maxLength={80} onChange={event => props.onProjectNameChange(event.target.value)} /></label>
    <label className="project-field"><span>Artist</span><input value={props.artistName} maxLength={80} onChange={event => props.onArtistNameChange(event.target.value)} /></label>
    <label className="project-field"><span>Notes</span><textarea value={props.notes} maxLength={500} onChange={event => props.onNotesChange(event.target.value)} /></label>
    <div className="canvas-option-label"><Layers3 /> Surface</div>
    <div className="surface-options">{SURFACES.map(surface => <button key={surface.id} className={props.surface === surface.id ? 'active' : ''} onClick={() => props.onSurfaceChange(surface.id)}><i style={{ background: surface.color }} />{surface.label}</button>)}</div>
    <div className="canvas-option-label"><FileImage /> PNG export</div>
    <div className="export-options">{([1, 2, 4] as const).map(scale => <button key={scale} className={props.exportScale === scale ? 'active' : ''} onClick={() => props.onExportScaleChange(scale)}>{scale}×</button>)}</div>
    <label className="transparent-toggle"><input type="checkbox" checked={props.transparentExport} onChange={event => props.onTransparentExportChange(event.target.checked)} /><span>Transparent export background</span></label>
  </section>
);

export default CanvasControls;
