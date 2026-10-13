import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Disc3, GripVertical, RotateCcw, RotateCw, Square } from 'lucide-react';

interface Props {
  spin: number;
  onSpinChange: (s: number) => void;
  /** The canvas frame the box floats in (and listens to for "spin while I hold the canvas"). */
  frameRef: React.RefObject<HTMLDivElement | null>;
}

interface Saved {
  speed: number;
  dir: 1 | -1;
  holdCanvas: boolean;
  collapsed: boolean;
  fx: number;
  fy: number;
}

const STORE = 'lbfs-turntable';
const MAX_RPM = 45;

function loadSaved(): Partial<Saved> {
  try {
    return JSON.parse(window.localStorage.getItem(STORE) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** A floating turntable box over the canvas: hold to spin, let go to coast, brake to stop. */
const SpinDock: React.FC<Props> = ({ spin, onSpinChange, frameRef }) => {
  const [speed, setSpeed] = useState(0.5);
  const [dir, setDir] = useState<1 | -1>(1);
  const [holdCanvas, setHoldCanvas] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState({ fx: 1, fy: 0 });
  const [held, setHeld] = useState<1 | -1 | null>(null);
  const [ready, setReady] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const live = useRef({ speed, dir, onSpinChange });
  live.current = { speed, dir, onSpinChange };

  useEffect(() => {
    const s = loadSaved();
    if (typeof s.speed === 'number') setSpeed(Math.max(0.1, Math.min(1, s.speed)));
    if (s.dir === 1 || s.dir === -1) setDir(s.dir);
    if (typeof s.holdCanvas === 'boolean') setHoldCanvas(s.holdCanvas);
    setCollapsed(typeof s.collapsed === 'boolean' ? s.collapsed : window.innerWidth < 700);
    if (typeof s.fx === 'number' && typeof s.fy === 'number') setPos({ fx: clamp01(s.fx), fy: clamp01(s.fy) });
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ speed, dir, holdCanvas, collapsed, ...pos }));
    } catch {
      // Private windows can refuse storage; the box still works, it just won't remember.
    }
  }, [ready, speed, dir, holdCanvas, collapsed, pos]);

  // "Spin while I hold the canvas": holding the left button (or a finger) on the
  // canvas spins the turntable; letting go lets it coast to a stop.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !holdCanvas) return;
    let active: number | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || active !== null || !(e.target instanceof HTMLCanvasElement)) return;
      active = e.pointerId;
      live.current.onSpinChange(live.current.dir * live.current.speed);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = null;
      live.current.onSpinChange(0);
    };
    frame.addEventListener('pointerdown', down);
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);
    return () => {
      frame.removeEventListener('pointerdown', down);
      frame.removeEventListener('pointerup', up);
      frame.removeEventListener('pointercancel', up);
      if (active !== null) live.current.onSpinChange(0);
    };
  }, [frameRef, holdCanvas]);

  const startHold = (d: 1 | -1) => {
    setDir(d);
    setHeld(d);
    onSpinChange(d * speed);
  };
  const endHold = () => {
    if (held === null) return;
    setHeld(null);
    onSpinChange(0);
  };
  const holdProps = (d: 1 | -1) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      startHold(d);
    },
    onPointerUp: endHold,
    onPointerCancel: endHold,
    onLostPointerCapture: endHold,
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        startHold(d);
      }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') endHold();
    },
    onBlur: endHold,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const changeSpeed = (v: number) => {
    setSpeed(v);
    if (held !== null) onSpinChange(held * v);
  };

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    const dock = dockRef.current?.getBoundingClientRect();
    if (!dock) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId, dx: e.clientX - dock.left, dy: e.clientY - dock.top };
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const area = dockRef.current?.parentElement?.getBoundingClientRect();
    const dock = dockRef.current?.getBoundingClientRect();
    if (!drag || drag.id !== e.pointerId || !area || !dock) return;
    const roomX = Math.max(1, area.width - dock.width);
    const roomY = Math.max(1, area.height - dock.height);
    setPos({ fx: clamp01((e.clientX - drag.dx - area.left) / roomX), fy: clamp01((e.clientY - drag.dy - area.top) / roomY) });
  };
  const onDragEnd = () => {
    dragRef.current = null;
  };

  const rpm = Math.round(Math.abs(spin) * MAX_RPM);
  const state = spin === 0 ? 'Stopped' : spin > 0 ? 'Clockwise' : 'Counter-clockwise';

  return (
    <div className="spin-dock-area">
      <div
        ref={dockRef}
        className={`spin-dock ${collapsed ? 'collapsed' : ''}`}
        style={{ left: `${pos.fx * 100}%`, top: `${pos.fy * 100}%`, transform: `translate(${-pos.fx * 100}%, ${-pos.fy * 100}%)` }}
        role="group"
        aria-label="Turntable"
      >
        <div className="spin-dock-head" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} title="Drag to move">
          <GripVertical className="spin-dock-grip" />
          <Disc3
            className={`spin-dock-dial ${rpm ? 'turning' : ''}`}
            style={rpm ? { animationDuration: `${(60 / rpm).toFixed(2)}s`, animationDirection: spin < 0 ? 'reverse' : 'normal' } : undefined}
          />
          <span className="spin-dock-title"><b>Turntable</b><small>{rpm ? `${state} · ${rpm} RPM` : state}</small></span>
          <button onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? 'Show turntable controls' : 'Hide turntable controls'} aria-expanded={!collapsed}>
            {collapsed ? <ChevronDown /> : <ChevronUp />}
          </button>
        </div>
        {!collapsed && <>
          <div className="spin-dock-buttons">
            <button className={held === -1 ? 'active' : ''} {...holdProps(-1)} title="Hold to spin counter-clockwise"><RotateCcw /><span>Hold</span></button>
            <button className={`brake ${spin === 0 ? 'stopped' : ''}`} onClick={() => { setHeld(null); onSpinChange(0); }} title="Brake the turntable"><Square /><span>Brake</span></button>
            <button className={held === 1 ? 'active' : ''} {...holdProps(1)} title="Hold to spin clockwise"><span>Hold</span><RotateCw /></button>
          </div>
          <label className="spin-dock-speed">
            <span>Speed</span>
            <input type="range" min={10} max={100} step={5} value={Math.round(speed * 100)} onChange={e => changeSpeed(Number(e.target.value) / 100)} aria-label="Turntable speed" />
            <i>{Math.round(speed * MAX_RPM)} RPM</i>
          </label>
          <div className="spin-dock-canvas">
            <label><input type="checkbox" checked={holdCanvas} onChange={e => setHoldCanvas(e.target.checked)} /> Spin while I hold the canvas</label>
            <button onClick={() => setDir(d => (d === 1 ? -1 : 1))} title="Direction when holding the canvas" aria-label={dir === 1 ? 'Spin clockwise; switch to counter-clockwise' : 'Spin counter-clockwise; switch to clockwise'}>
              {dir === 1 ? <RotateCw /> : <RotateCcw />}
            </button>
          </div>
        </>}
      </div>
    </div>
  );
};

export default SpinDock;
