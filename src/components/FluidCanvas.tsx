import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import LegacyFluidCanvas, { FluidCanvasHandle, FluidCanvasProps } from './LegacyFluidCanvas';
import { GpuFluidEngine } from '@/lib/gpu/GpuFluidEngine';
import { PourDirector, engineSettings } from '@/lib/gpu/pours';
import type { Tool } from '@/lib/fluidEngine';

export type { FluidCanvasHandle, FluidCanvasProps };

const MAX_DPR = 2;

const cursorFor = (tool: Tool) =>
  tool === 'pour' ? 'crosshair'
    : tool === 'tilt' ? 'move'
      : tool === 'cell' ? 'cell'
        : tool === 'torch' ? 'pointer'
          : 'grab';

type GpuProps = FluidCanvasProps & { onUnsupported: () => void };

/** The GPU paint simulation (WebGL2). Same props and handle as the classic canvas. */
const GpuFluidCanvas = forwardRef<FluidCanvasHandle, GpuProps>((props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GpuFluidEngine | null>(null);
  const directorRef = useRef<PourDirector | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const tiltDragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const pixelSize = (): [number, number] => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      return [Math.max(1, Math.round(container.clientWidth * dpr)), Math.max(1, Math.round(container.clientHeight * dpr))];
    };
    let applied: unknown[] | null = null;
    const create = () => {
      // Size the drawing buffer first so the paint buffers match the canvas shape.
      const [w, h] = pixelSize();
      canvas.width = w;
      canvas.height = h;
      const engine = new GpuFluidEngine(canvas);
      engineRef.current = engine;
      directorRef.current = new PourDirector(engine);
      applied = null;
    };
    try {
      create();
    } catch (err) {
      console.warn('GPU paint engine unavailable, using the classic engine.', err);
      propsRef.current.onUnsupported();
      return;
    }

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const [w, h] = pixelSize();
        engineRef.current?.resize(w, h);
      }, 120);
    });
    ro.observe(container);

    const onLost = (ev: Event) => ev.preventDefault();
    const onRestored = () => {
      try {
        create();
      } catch {
        propsRef.current.onUnsupported();
      }
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    let raf = 0;
    let last = performance.now();
    let statsClock = 0;
    let reported = '';
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const engine = engineRef.current;
      const director = directorRef.current;
      if (!engine || !director || engine.lost) return;
      // Clamp the step so a background tab or a hitch can't blow the paint apart.
      const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 30);
      last = now;
      const p = propsRef.current;
      const key = [p.params, p.surface, p.tilt, p.spin];
      if (!applied || key.some((k, i) => k !== applied?.[i])) {
        engine.setSettings(engineSettings(p.params, p.surface, p.tilt, p.spin));
        applied = key;
      }
      // Once every bit of paint has dried and nothing is being poured, the
      // simulation has nothing left to do; just keep drawing.
      const settled = !director.active && engine.stats.wet < 0.0005 && engine.statsFresh;
      if (!settled) {
        director.update(dt, p);
        engine.step(dt);
      }
      engine.render();
      statsClock += dt;
      if (statsClock > 0.25) {
        statsClock = 0;
        engine.updateStats();
        const wet = Math.round(engine.stats.wet * 100);
        const next = `${wet}/${engine.cellCount}`;
        if (next !== reported && p.onStats) {
          reported = next;
          p.onStats(wet, engine.cellCount, 'percent');
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      engineRef.current?.destroy();
      engineRef.current = null;
      directorRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      const engine = engineRef.current;
      if (!engine) return;
      directorRef.current?.cancel();
      engine.pushUndo();
      engine.clear();
    },
    exportPNG: (scale = 2, transparent = false) => {
      const engine = engineRef.current;
      const box = containerRef.current;
      if (!engine || !box) return;
      const s = Math.max(1, Math.min(4, Math.round(scale)));
      const out = engine.exportCanvas(box.clientWidth * s, box.clientHeight * s, transparent);
      if (!out) return;
      out.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `lucky-bear-pour-${s}x-${Date.now()}.png`;
        link.href = url;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }, 'image/png');
    },
    getSnapshot: () => {
      const engine = engineRef.current;
      const box = containerRef.current;
      if (!engine || !box) return null;
      const full = engine.exportCanvas(box.clientWidth, box.clientHeight, false);
      if (!full) return null;
      const thumb = document.createElement('canvas');
      const tw = 260;
      const th = Math.round((full.height / full.width) * tw);
      thumb.width = tw;
      thumb.height = th;
      thumb.getContext('2d')?.drawImage(full, 0, 0, tw, th);
      return {
        full: full.toDataURL('image/jpeg', 0.82),
        thumb: thumb.toDataURL('image/jpeg', 0.7),
      };
    },
    loadSnapshot: (url: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      directorRef.current?.cancel();
      engine.pushUndo();
      const img = new Image();
      if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.onload = () => engineRef.current?.loadImage(img);
      img.src = url;
    },
    undo: () => {
      directorRef.current?.cancel();
      return engineRef.current?.undo() ?? false;
    },
    redo: () => {
      directorRef.current?.cancel();
      return engineRef.current?.redo() ?? false;
    },
  }), []);

  const pointOf = (e: React.PointerEvent) => {
    const r = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    return { px, py, x: px / Math.max(1, r.width), y: py / Math.max(1, r.height) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = propsRef.current;
    const pt = pointOf(e);
    if (p.tool === 'tilt') {
      tiltDragRef.current = { id: e.pointerId, x: pt.px, y: pt.py };
      return;
    }
    directorRef.current?.pointerDown(e.pointerId, pt.x, pt.y, p);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = pointOf(e);
    const drag = tiltDragRef.current;
    if (drag && drag.id === e.pointerId) {
      const tx = Math.max(-1, Math.min(1, (pt.px - drag.x) / 140));
      const ty = Math.max(-1, Math.min(1, (pt.py - drag.y) / 140));
      propsRef.current.onTiltChange({ x: tx, y: ty });
      return;
    }
    directorRef.current?.pointerMove(e.pointerId, pt.x, pt.y);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (tiltDragRef.current?.id === e.pointerId) tiltDragRef.current = null;
    directorRef.current?.pointerUp(e.pointerId);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden canvas-surface">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full touch-none"
        style={{ cursor: cursorFor(props.tool) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
      />
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 110px rgba(37,30,20,0.13)' }} />
    </div>
  );
});
GpuFluidCanvas.displayName = 'GpuFluidCanvas';

/**
 * Paint canvas. Uses the GPU paint engine, and falls back to the classic
 * particle engine on devices without WebGL2 (or with ?engine=classic).
 */
const FluidCanvas = forwardRef<FluidCanvasHandle, FluidCanvasProps>((props, ref) => {
  const [engine, setEngine] = useState<'gpu' | 'classic'>('gpu');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('engine') === 'classic') setEngine('classic');
  }, []);
  const onUnsupported = useCallback(() => setEngine('classic'), []);
  return engine === 'gpu'
    ? <GpuFluidCanvas ref={ref} {...props} onUnsupported={onUnsupported} />
    : <LegacyFluidCanvas ref={ref} {...props} />;
});

FluidCanvas.displayName = 'FluidCanvas';
export default FluidCanvas;
