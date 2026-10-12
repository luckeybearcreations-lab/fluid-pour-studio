import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import {
  createSim, step, render, spawnPour, spawnCupPour, spawnCell, applyScrape, applyBlower, applyTorch,
  ONE_SHOT_POUR_MODES, Sim, PhysicsParams, PourMode, Tool, CanvasSurface,
} from '@/lib/fluidEngine';
import { PaintColor } from '@/lib/palette';

export interface FluidCanvasHandle {
  clear: () => void;
  exportPNG: (scale?: number, transparent?: boolean) => void;
  getSnapshot: () => { full: string; thumb: string } | null;
  loadSnapshot: (dataUrl: string) => void;
  undo: () => boolean;
  redo: () => boolean;
}

interface Props {
  tool: Tool;
  pourMode: PourMode;
  color: PaintColor;
  cupColors: PaintColor[];
  params: PhysicsParams;
  tilt: { x: number; y: number };
  spin: number;
  surface: CanvasSurface;
  onTiltChange: (t: { x: number; y: number }) => void;
  onStats?: (particles: number, cells: number) => void;
}

const FluidCanvas = forwardRef<FluidCanvasHandle, Props>((props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Sim | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const historyRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const pourFrameRef = useRef(0);

  const pointerRef = useRef<{ down: boolean; x: number; y: number; lastX: number; lastY: number; startX: number; startY: number; flowX: number; flowY: number }>({
    down: false, x: 0, y: 0, lastX: 0, lastY: 0, startX: 0, startY: 0, flowX: 0, flowY: 0,
  });

  // Keep sim tilt/spin/params synced with props
  useEffect(() => {
    const sim = simRef.current;
    if (sim) {
      sim.tiltX = props.tilt.x;
      sim.tiltY = props.tilt.y;
      sim.spin = props.spin;
      sim.params = props.params;
      sim.surface = props.surface;
    }
  }, [props.tilt, props.spin, props.params, props.surface]);

  const composite = useCallback((scale: number, transparent = false): HTMLCanvasElement | null => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    const sim = simRef.current;
    if (!canvas || !base || !sim) return null;
    const out = document.createElement('canvas');
    out.width = sim.width * scale;
    out.height = sim.height * scale;
    const ctx = out.getContext('2d')!;
    ctx.scale(scale, scale);
    // Render the current full frame (base + live paint) onto the export canvas
    render(ctx, base, sim, transparent);
    return out;
  }, []);

  const restoreDataUrl = useCallback((url: string) => {
    const base = baseRef.current;
    const sim = simRef.current;
    if (!base || !sim) return;
    const img = new Image();
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = base.getContext('2d')!;
      ctx.clearRect(0, 0, base.width, base.height);
      ctx.drawImage(img, 0, 0, base.width, base.height);
      sim.particles = [];
      sim.cells = [];
      sim.turbEnergy = 0;
    };
    img.src = url;
  }, []);

  const pushHistory = useCallback(() => {
    const current = composite(1);
    if (!current) return;
    historyRef.current.push(current.toDataURL('image/png'));
    if (historyRef.current.length > 20) historyRef.current.shift();
    redoRef.current = [];
  }, [composite]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      pushHistory();
      const sim = simRef.current;
      const base = baseRef.current;
      if (sim) { sim.particles = []; sim.cells = []; sim.turbEnergy = 0; }
      if (base) base.getContext('2d')!.clearRect(0, 0, base.width, base.height);
    },
    exportPNG: (scale = 2, transparent = false) => {
      const safeScale = Math.max(1, Math.min(4, Math.round(scale)));
      const out = composite(safeScale, transparent);
      if (!out) return;
      const link = document.createElement('a');
      link.download = `lucky-bear-pour-${safeScale}x-${Date.now()}.png`;
      link.href = out.toDataURL('image/png');
      link.click();
    },
    getSnapshot: () => {
      const full = composite(1);
      if (!full) return null;
      const thumb = document.createElement('canvas');
      const tw = 260;
      const th = Math.round((full.height / full.width) * tw);
      thumb.width = tw; thumb.height = th;
      thumb.getContext('2d')!.drawImage(full, 0, 0, tw, th);
      return {
        full: full.toDataURL('image/jpeg', 0.82),
        thumb: thumb.toDataURL('image/jpeg', 0.7),
      };
    },
    loadSnapshot: (url: string) => {
      pushHistory();
      restoreDataUrl(url);
    },
    undo: () => {
      const previous = historyRef.current.pop();
      if (!previous) return false;
      const current = composite(1);
      if (current) redoRef.current.push(current.toDataURL('image/png'));
      restoreDataUrl(previous);
      return true;
    },
    redo: () => {
      const next = redoRef.current.pop();
      if (!next) return false;
      const current = composite(1);
      if (current) historyRef.current.push(current.toDataURL('image/png'));
      restoreDataUrl(next);
      return true;
    },
  }), [composite, pushHistory, restoreDataUrl]);

  // Main setup: sizing, sim creation, rAF loop
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const base = document.createElement('canvas');
    baseRef.current = base;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      // preserve dried paint across resizes
      const old = document.createElement('canvas');
      old.width = base.width || 1; old.height = base.height || 1;
      old.getContext('2d')!.drawImage(base, 0, 0);
      canvas.width = w; canvas.height = h;
      base.width = w; base.height = h;
      if (old.width > 1) base.getContext('2d')!.drawImage(old, 0, 0, w, h);
      if (!simRef.current) {
        simRef.current = createSim(w, h, propsRef.current.params);
      } else {
        simRef.current.width = w;
        simRef.current.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let frame = 0;
    const loop = () => {
      const sim = simRef.current;
      if (sim) {
        const p = propsRef.current;
        const ptr = pointerRef.current;
        // Continuous pour while pointer held
        if (ptr.down && p.tool === 'pour' && !ONE_SHOT_POUR_MODES.has(p.pourMode)) {
          const layers = p.cupColors.length ? p.cupColors : [p.color];
          const activeColor = layers[Math.floor(pourFrameRef.current / 18) % layers.length];
          spawnPour(sim, ptr.x, ptr.y, activeColor, p.pourMode, ptr.flowX, ptr.flowY);
          pourFrameRef.current++;
          ptr.flowX *= 0.86;
          ptr.flowY *= 0.86;
        }
        step(sim, base.getContext('2d')!);
        render(ctx, base, sim);
        frame++;
        if (frame % 20 === 0 && p.onStats) p.onStats(sim.particles.length, sim.cells.length);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Pointer handlers
  const getPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const { x, y } = getPos(e);
    const ptr = pointerRef.current;
    ptr.down = true; ptr.x = x; ptr.y = y;
    ptr.lastX = x; ptr.lastY = y; ptr.startX = x; ptr.startY = y; ptr.flowX = 0; ptr.flowY = 0;
    const sim = simRef.current;
    const p = propsRef.current;
    if (!sim) return;
    pushHistory();
    if (p.tool === 'pour' && ONE_SHOT_POUR_MODES.has(p.pourMode)) {
      spawnCupPour(sim, x, y, p.cupColors.length ? p.cupColors : [p.color], p.pourMode as Exclude<PourMode, 'stream' | 'splatter' | 'drip'>);
      ptr.down = false;
    } else if (p.tool === 'cell') {
      const other = p.cupColors.find(paint => paint.id !== p.color.id)?.hex;
      spawnCell(sim, x, y, p.color.hex, other, .9 + (p.color.silicone ?? 0));
    } else if (p.tool === 'torch') {
      applyTorch(sim, x, y, p.color.hex);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const ptr = pointerRef.current;
    const { x, y } = getPos(e);
    const dx = x - ptr.lastX, dy = y - ptr.lastY;
    ptr.x = x; ptr.y = y;
    ptr.flowX = dx; ptr.flowY = dy;
    if (!ptr.down) return;
    const sim = simRef.current;
    const p = propsRef.current;
    if (!sim) return;
    if (p.tool === 'scraper' || p.tool === 'comb') {
      applyScrape(sim, x, y, dx, dy, p.tool === 'comb');
    } else if (p.tool === 'blower') {
      applyBlower(sim, x, y, dx, dy);
    } else if (p.tool === 'tilt') {
      const tx = Math.max(-1, Math.min(1, (x - ptr.startX) / 140));
      const ty = Math.max(-1, Math.min(1, (y - ptr.startY) / 140));
      p.onTiltChange({ x: tx, y: ty });
    }
    ptr.lastX = x; ptr.lastY = y;
  };

  const onPointerUp = () => {
    pointerRef.current.down = false;
  };

  const cursorFor = (tool: Tool) =>
    tool === 'pour' ? 'crosshair'
      : tool === 'tilt' ? 'move'
      : tool === 'cell' ? 'cell'
      : tool === 'torch' ? 'pointer'
      : 'grab';

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden canvas-surface">
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none"
        style={{ cursor: cursorFor(props.tool) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      {/* subtle canvas texture vignette */}
      <div className="pointer-events-none absolute inset-0" style={{
        boxShadow: 'inset 0 0 110px rgba(37,30,20,0.13)',
      }} />
    </div>
  );
});

FluidCanvas.displayName = 'FluidCanvas';
export default FluidCanvas;
