import React from 'react';
import { PALETTE, PaintColor, lighten } from '@/lib/palette';
import { MATERIAL_OPTIONS, normalizePaintMaterial, PaintMaterial } from '@/lib/paintMaterials';
import { Check, Plus, RotateCcw, Sparkle } from 'lucide-react';

interface Props {
  selected: PaintColor;
  cup: PaintColor[];
  onSelect: (color: PaintColor) => void;
  onToggleCup: (color: PaintColor) => void;
  onResetCup: () => void;
  onUpdateSelected: (patch: Partial<PaintColor>) => void;
}

const ColorPalette: React.FC<Props> = ({ selected, cup, onSelect, onToggleCup, onResetCup, onUpdateSelected }) => (
  <section className="control-section">
    <div className="section-heading"><span>02</span><h2>Layered Pour Cup</h2><strong>{cup.length}/5 colors</strong></div>
    <div className="pour-cup-builder">
      <div className="pour-cup" aria-label={`${cup.length} paint layers in the pour cup`}>
        <div className="cup-rim" />
        <div className="cup-layers">{cup.map((paint, index) => <button key={`${paint.id}-${index}`} onClick={() => onSelect(paint)} aria-label={`Select layer ${index + 1}, ${paint.name}`} style={{ flexGrow: Math.max(5, paint.amount ?? 20), background: `linear-gradient(90deg, ${paint.hex}, ${lighten(paint.hex, .22)}, ${paint.hex})` }} />)}</div>
      </div>
      <div className="cup-summary">
        {cup.map((paint, index) => <button key={`${paint.id}-label-${index}`} className={selected.id === paint.id ? 'active' : ''} onClick={() => onSelect(paint)}><i style={{ background: paint.hex }} />{index + 1}. {paint.name}<small>{paint.amount ?? 20} parts</small></button>)}
        <button className="cup-reset" onClick={onResetCup}><RotateCcw /> Reset cup</button>
      </div>
    </div>
    <div className="paint-wells">{PALETTE.map(color => {
      const isSelected = color.id === selected.id;
      const inCup = cup.some(paint => paint.id === color.id);
      return <button key={color.id} onClick={() => onToggleCup(color)} aria-label={`${inCup ? 'Remove' : 'Add'} ${color.name} ${inCup ? 'from' : 'to'} pour cup`} aria-pressed={inCup} className={`${isSelected ? 'active ' : ''}${inCup ? 'in-cup' : ''}`} style={{ background: color.metallic ? `linear-gradient(135deg, ${lighten(color.hex, .35)}, ${color.hex} 46%, ${lighten(color.hex, .2)} 72%, ${color.hex})` : `radial-gradient(circle at 32% 28%, ${lighten(color.hex, .25)}, ${color.hex} 66%)` }}>{inCup ? <Check /> : <Plus />}{color.metallic && <Sparkle className="metal-mark" />}</button>;
    })}<label className="custom-paint" title="Mix a custom paint"><input type="color" value={selected.hex} onChange={event => onToggleCup({ id: `custom-${event.target.value}`, name: 'Custom Mix', hex: event.target.value })} /><Plus /></label></div>
    <div className="paint-properties">
      <div className="paint-property-title"><span>Selected layer</span><strong>{selected.name}</strong></div>
      <label><span>Material</span><select aria-label="Selected paint material" value={normalizePaintMaterial(selected.material, Boolean(selected.metallic))} onChange={event => { const material = event.target.value as PaintMaterial; onUpdateSelected({ material, metallic: material === 'metallic' || material === 'pearl' }); }}>{MATERIAL_OPTIONS.map(material => <option key={material.id} value={material.id}>{material.label}</option>)}</select></label>
      <label><span>Layer amount <b>{selected.amount ?? 20}</b></span><input aria-label="Selected paint layer amount" type="range" min={5} max={80} value={selected.amount ?? 20} onChange={event => onUpdateSelected({ amount: Number(event.target.value) })} /></label>
      <label><span>Silicone <b>{Math.round((selected.silicone ?? 0) * 100)}%</b></span><input aria-label="Selected paint silicone amount" type="range" min={0} max={100} value={Math.round((selected.silicone ?? 0) * 100)} onChange={event => onUpdateSelected({ silicone: Number(event.target.value) / 100 })} /></label>
    </div>
    <p className="control-hint"><Sparkle /> Build layers with different amounts and materials. Wet edges mix without erasing the marbling.</p>
  </section>
);

export default ColorPalette;
