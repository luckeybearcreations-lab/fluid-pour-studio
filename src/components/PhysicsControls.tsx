import React, { useRef } from 'react';
import { PhysicsParams } from '@/lib/fluidEngine';
import { Gauge, LocateFixed, RotateCcw, RotateCw, Square } from 'lucide-react';

interface Props {
  params: PhysicsParams; onParamsChange: (p: PhysicsParams) => void;
  tilt: { x: number; y: number }; onTiltChange: (t: { x: number; y: number }) => void;
  spin: number; onSpinChange: (s: number) => void;
}

const Slider: React.FC<{ label: string; value: number; onChange: (v: number) => void; minLabel: string; maxLabel: string }> = ({ label, value, onChange, minLabel, maxLabel }) => <div>
  <div className="flex justify-between items-baseline mb-1"><span className="text-[11px] font-medium text-zinc-300">{label}</span><span className="text-[10px] tabular-nums text-zinc-500">{Math.round(value * 100)}%</span></div>
  <input aria-label={label} type="range" min={0} max={100} value={Math.round(value * 100)} onChange={e => onChange(Number(e.target.value) / 100)} className="w-full h-1.5 rounded-full appearance-none bg-zinc-700 accent-amber-500 cursor-pointer" />
  <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5"><span>{minLabel}</span><span>{maxLabel}</span></div>
</div>;

const PAD = 104;
const clampSpin = (n: number) => Math.max(-1, Math.min(1, Math.round(n * 20) / 20));

const PhysicsControls: React.FC<Props> = ({ params, onParamsChange, tilt, onTiltChange, spin, onSpinChange }) => {
  const padRef = useRef<HTMLDivElement>(null);
  const set = (key: keyof PhysicsParams) => (v: number) => onParamsChange({ ...params, [key]: v });
  const handlePad = (e: React.PointerEvent) => {
    if (e.buttons !== 1 && e.type !== 'pointerdown') return;
    const rect = padRef.current!.getBoundingClientRect();
    onTiltChange({
      x: Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1)),
    });
  };
  const rpm = Math.round(Math.abs(spin) * 45);
  const direction = spin < 0 ? 'Counter-clockwise' : spin > 0 ? 'Clockwise' : 'Turntable stopped';

  return <section className="control-section physics-section space-y-4">
    <div className="section-heading"><span>03</span><h2>Movement</h2></div>
    <Slider label="Viscosity" value={params.viscosity} onChange={set('viscosity')} minLabel="Fluid" maxLabel="Heavy body" />
    <Slider label="Flow rate" value={params.flowRate} onChange={set('flowRate')} minLabel="Trickle" maxLabel="Flood" />
    <Slider label="Gravity" value={params.gravity} onChange={set('gravity')} minLabel="Gentle" maxLabel="Strong" />
    <Slider label="Surface tension" value={params.surfaceTension} onChange={set('surfaceTension')} minLabel="Loose" maxLabel="Cohesive" />
    <Slider label="Pigment mixing" value={params.colorMixing} onChange={set('colorMixing')} minLabel="Marbled" maxLabel="Blended" />
    <Slider label="Silicone response" value={params.silicone} onChange={set('silicone')} minLabel="Quiet" maxLabel="Reactive" />
    <Slider label="Cell bloom" value={params.cellFrequency} onChange={set('cellFrequency')} minLabel="Rare" maxLabel="Active" />
    <Slider label="Drying speed" value={params.dryingRate} onChange={set('dryingRate')} minLabel="Long open time" maxLabel="Quick set" />
    <Slider label="Turbulence" value={params.turbulence} onChange={set('turbulence')} minLabel="Calm" maxLabel="Energetic" />

    <div className="tilt-control">
      <div className="movement-label"><span>Tilt table</span><button onClick={() => onTiltChange({ x: 0, y: 0 })} title="Level the canvas"><LocateFixed /> Level</button></div>
      <div ref={padRef} onPointerDown={e => { (e.currentTarget as Element).setPointerCapture(e.pointerId); handlePad(e); }} onPointerMove={handlePad} className="tilt-pad" style={{ height: PAD }}>
        <span className="tilt-axis vertical" /><span className="tilt-axis horizontal" />
        <span className="tilt-ring" />
        <span className="tilt-knob" style={{ left: `${(tilt.x + 1) * 50}%`, top: `${(tilt.y + 1) * 50}%` }} />
      </div>
    </div>

    <div className="spin-console">
      <div className="spin-readout"><div><Gauge /><span><b>{direction}</b><small>{rpm} RPM · eased momentum</small></span></div><strong>{spin > 0 ? '+' : ''}{Math.round(spin * 100)}</strong></div>
      <div className="spin-buttons">
        <button onClick={() => onSpinChange(clampSpin(spin - .1))} title="Decrease counter-clockwise speed"><RotateCcw />−10</button>
        <button onClick={() => onSpinChange(0)} className={spin === 0 ? 'active' : ''} title="Brake turntable"><Square />Brake</button>
        <button onClick={() => onSpinChange(clampSpin(spin + .1))} title="Increase clockwise speed">+10<RotateCw /></button>
      </div>
      <input aria-label="Turntable speed and direction" type="range" min={-100} max={100} step={5} value={Math.round(spin * 100)} onChange={e => onSpinChange(Number(e.target.value) / 100)} />
      <div className="spin-scale"><span>← 45 RPM</span><i>0</i><span>45 RPM →</span></div>
      <div className="spin-presets"><button onClick={() => onSpinChange(-.35)}>Gentle CCW</button><button onClick={() => onSpinChange(.35)}>Gentle CW</button><button onClick={() => onSpinChange(.72)}>Bloom</button></div>
    </div>
    <p className="control-hint">Spin now accelerates and coasts like a real turntable. Brake returns it smoothly to rest.</p>
  </section>;
};

export default PhysicsControls;
