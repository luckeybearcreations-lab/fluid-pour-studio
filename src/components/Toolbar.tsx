import React from 'react';
import { Droplets, Move, CircleDot, Slice, AlignJustify, Waves, CloudDrizzle, Sparkles, CupSoda, Wind, Flame } from 'lucide-react';
import { Tool, PourMode } from '@/lib/fluidEngine';

interface Props { tool: Tool; onToolChange: (t: Tool) => void; pourMode: PourMode; onPourModeChange: (m: PourMode) => void; }
const TOOLS: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'pour', label: 'Pour', icon: <Droplets />, hint: 'Hold and move to lay down paint' },
  { id: 'tilt', label: 'Tilt', icon: <Move />, hint: 'Drag to tip the canvas' },
  { id: 'cell', label: 'Cell', icon: <CircleDot />, hint: 'Tap to bloom a new cell' },
  { id: 'scraper', label: 'Scrape', icon: <Slice />, hint: 'Push paint across the surface' },
  { id: 'comb', label: 'Comb', icon: <AlignJustify />, hint: 'Pull fine feathered ribbons' },
  { id: 'blower', label: 'Blower', icon: <Wind />, hint: 'Drag to blow wet paint in one direction' },
  { id: 'torch', label: 'Torch', icon: <Flame />, hint: 'Tap to open and enlarge nearby cells' },
];
const MODES: { id: PourMode; label: string; icon: React.ReactNode }[] = [
  { id: 'stream', label: 'Ribbon', icon: <Waves /> },
  { id: 'splatter', label: 'Splatter', icon: <Sparkles /> },
  { id: 'drip', label: 'Drip', icon: <CloudDrizzle /> },
  { id: 'flip', label: 'Flip Cup', icon: <CupSoda /> },
  { id: 'dirty', label: 'Dirty', icon: <Droplets /> },
  { id: 'ring', label: 'Tree Ring', icon: <CircleDot /> },
  { id: 'dutch', label: 'Dutch', icon: <Wind /> },
  { id: 'swipe', label: 'Swipe', icon: <Move /> },
  { id: 'open', label: 'Open Cup', icon: <CupSoda /> },
  { id: 'bloom', label: 'Bloom', icon: <Sparkles /> },
];

const Toolbar: React.FC<Props> = ({ tool, onToolChange, pourMode, onPourModeChange }) => {
  const active = TOOLS.find(t => t.id === tool);
  return <section className="control-section">
    <div className="section-heading"><span>01</span><h2>Technique</h2></div>
    <div className="tool-grid">{TOOLS.map(t => <button key={t.id} onClick={() => onToolChange(t.id)} title={t.hint} className={tool === t.id ? 'active' : ''}>{t.icon}<span>{t.label}</span></button>)}</div>
    <p className="control-hint">{active?.hint}</p>
    {tool === 'pour' && <div className="mode-block"><label>Pour character</label><div className="segmented-control">{MODES.map(m => <button key={m.id} onClick={() => onPourModeChange(m.id)} className={pourMode === m.id ? 'active' : ''}>{m.icon}{m.label}</button>)}</div></div>}
  </section>;
};
export default Toolbar;
