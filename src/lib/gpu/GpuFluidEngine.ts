// GPU paint engine (WebGL2): a stable-fluids grid simulation tuned to behave
// like acrylic pouring paint. Thick, slow, laminar flow with crisp ribbons
// between colors, cells, drying, metallic and pearl shine.
//
// The JS side only schedules shader passes. Tools and pours (see pours.ts)
// call splatPaint / splatForce / addSource / splatCells before each step().
// Coordinates are canvas UV with y pointing UP (0 = bottom, 1 = top), and
// distances are in canvas heights.

import * as S from './shaders';

export type Vec3 = [number, number, number];

export interface EngineSettings {
  damping: number; // velocity drag per second for normal-bodied paint
  curl: number; // vorticity confinement (swirl detail)
  wander: number; // slow drifting swirl so pours don't make perfect circles
  tilt: [number, number]; // gravity along the canvas, canvas heights / s^2, y up
  spin: number; // turntable, radians per second (positive = counter-clockwise)
  tension: number; // surface tension (crisp, rounded paint edges)
  mix: number; // pigment mixing between neighboring wet colors
  sharpen: number; // keeps boundaries between wet colors crisp
  dryRate: number; // wetness lost per second
  gloss: number;
  surface: Vec3; // canvas color, linear light
  weave: number; // canvas texture strength
}

export const DEFAULT_SETTINGS: EngineSettings = {
  damping: 2.6,
  curl: 0.55,
  wander: 0.7,
  tilt: [0, 0],
  spin: 0,
  tension: 17,
  mix: 0.42,
  sharpen: 0,
  dryRate: 0.014,
  gloss: 0.85,
  surface: [0.93, 0.9, 0.85],
  weave: 1,
};

export interface PaintSplat {
  color: Vec3; // linear light
  metallic: number;
  pearl: number;
  body: number; // 0 thin .. 1 heavy body
  strength: number; // 1 opaque, lower glazes over what's below
}

export interface CellOptions {
  amount: number; // 0..1 bigger, denser cells
  strength: number;
  kick: number; // how hard cells push paint open as they form
  cellColor: Vec3;
  innerColor: Vec3;
  palette: Vec3[];
}

export function hexToLinear(hex: string): Vec3 {
  const v = hex.replace('#', '');
  const n = v.length === 3 ? v.split('').map(c => c + c).join('') : v.padEnd(6, '0');
  const ch = (i: number) => Math.pow(parseInt(n.slice(i, i + 2), 16) / 255, 2.2);
  return [ch(0), ch(2), ch(4)];
}

export function supportsGpuPaint(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    const ok = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

const QUALITY = {
  standard: { sim: 160, dye: 1024, iterations: 24 },
  high: { sim: 192, dye: 1536, iterations: 28 },
};
type QualityName = keyof typeof QUALITY;

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

interface DoubleTarget {
  read: Target;
  write: Target;
  swap: () => void;
}

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface Snapshot {
  dye: Target;
  props: Target;
}

interface Format {
  internal: number;
  format: number;
  type: number;
  filter: number;
}

const PROGRAMS = {
  copy: S.copyShader,
  image: S.imageShader,
  dyeSplat: S.dyeSplatShader,
  propSplat: S.propSplatShader,
  velocitySplat: S.velocitySplatShader,
  cellDye: S.cellDyeShader,
  cellVelocity: S.cellVelocityShader,
  advect: S.advectShader,
  maccormack: S.maccormackShader,
  force: S.forceShader,
  curl: S.curlShader,
  vorticity: S.vorticityShader,
  divergence: S.divergenceShader,
  pressure: S.pressureShader,
  gradient: S.gradientSubtractShader,
  tension: S.tensionShader,
  stats: S.statsShader,
  display: S.displayShader,
};
type ProgramName = keyof typeof PROGRAMS;

// Splats applied per shader pass (must match the arrays in shaders.ts).
const BATCH = 16;
const STATS_W = 64;
const STATS_H = 40;

const sizeFor = (res: number, aspect: number): [number, number] =>
  aspect >= 1 ? [Math.round(res * aspect), res] : [res, Math.round(res / aspect)];

export class GpuFluidEngine {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  settings: EngineSettings = { ...DEFAULT_SETTINGS, tilt: [0, 0] };
  aspect = 1;
  simSize: [number, number] = [1, 1];
  dyeSize: [number, number] = [1, 1];
  propSize: [number, number] = [1, 1];
  /** Rough count of cells made since the canvas was cleared. */
  cellCount = 0;
  /** Latest async readout: share of the canvas covered, and covered with wet paint (0..1). */
  stats = { coverage: 0, wet: 0 };

  private quality: { sim: number; dye: number; iterations: number };
  private minDye: number;
  private maxUndo: number;
  private maxTexture: number;
  private fmtFloat: Format;
  private fmtProps: Format;
  private fmtByte: Format;
  private vs: WebGLShader | null = null;
  private prog = {} as Record<ProgramName, Program>;
  private current: Program | null = null;
  private quad: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private velocity!: DoubleTarget;
  private pressure!: DoubleTarget;
  private divergence!: Target;
  private curlT!: Target;
  private dye!: DoubleTarget;
  private dyeA!: Target;
  private dyeB!: Target;
  private props!: DoubleTarget;
  private statsTarget!: Target;
  private statsPbo: WebGLBuffer | null = null;
  private statsSync: WebGLSync | null = null;
  private statsPixels = new Uint8Array(STATS_W * STATS_H * 4);
  private paintSplats = new Float32Array(BATCH * 4);
  private paintColors = new Float32Array(BATCH * 3);
  private propSplats = new Float32Array(BATCH * 4);
  private propValues = new Float32Array(BATCH * 4);
  private paintCount = 0;
  private forceSplats = new Float32Array(BATCH * 4);
  private forceValues = new Float32Array(BATCH * 4);
  private forceCount = 0;
  private sources = new Float32Array(32);
  private sourceDirs = new Float32Array(32);
  private sourceCount = 0;
  private paletteBuf = new Float32Array(24);
  private time = 0;
  private dryClock = 0;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private pool: Snapshot[] = [];
  private destroyed = false;
  // Bumped on every change to the paint, so callers can tell whether the
  // stats readout was taken after the latest change.
  private epoch = 0;
  private pendingEpoch = -1;
  private statsEpoch = -1;

  constructor(canvas: HTMLCanvasElement, opts: { quality?: QualityName; dye?: number; sim?: number } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available on this device.');
    this.gl = gl;
    const hasFloat = gl.getExtension('EXT_color_buffer_float');
    const hasHalf = gl.getExtension('EXT_color_buffer_half_float');
    if (!hasFloat && !hasHalf) throw new Error('This device cannot render the paint simulation.');

    const mobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const q = QUALITY[opts.quality ?? (mobile ? 'standard' : 'high')];
    // dye/sim override the paint and flow resolution (used for quick tests).
    this.quality = { ...q, dye: opts.dye ?? q.dye, sim: opts.sim ?? q.sim };
    this.minDye = Math.min(1024, this.quality.dye);
    this.maxUndo = mobile ? 3 : 6;
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.fmtFloat = { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR };
    this.fmtProps = this.fmtFloat;
    this.fmtByte = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR };

    this.initQuad();
    for (const name of Object.keys(PROGRAMS) as ProgramName[]) this.prog[name] = this.program(PROGRAMS[name]);
    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    this.allocate(w, h);
    this.statsTarget = this.target(STATS_W, STATS_H, this.fmtByte);
    this.clear();
  }

  // ---------- setup ----------

  private initQuad() {
    const gl = this.gl;
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
  }

  private compile(type: number, src: string) {
    const gl = this.gl;
    const s = gl.createShader(type);
    if (!s) throw new Error('Could not create a shader.');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  private program(fragSrc: string): Program {
    const gl = this.gl;
    if (!this.vs) this.vs = this.compile(gl.VERTEX_SHADER, S.baseVertex);
    const p = gl.createProgram();
    if (!p) throw new Error('Could not create a shader program.');
    gl.attachShader(p, this.vs);
    gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(p, 0, 'aPosition');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('Shader link failed: ' + gl.getProgramInfoLog(p));
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      uniforms[name] = gl.getUniformLocation(p, name);
    }
    return { program: p, uniforms };
  }

  private target(w: number, h: number, f: Format): Target {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error('Could not create paint buffers.');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, f.type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
      throw new Error('This device cannot create the paint buffers.');
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }

  private double(w: number, h: number, f: Format): DoubleTarget {
    const d: DoubleTarget = {
      read: this.target(w, h, f),
      write: this.target(w, h, f),
      swap() {
        const r = d.read;
        d.read = d.write;
        d.write = r;
      },
    };
    return d;
  }

  private kill(t: Target | undefined) {
    if (!t) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  /** Texture sizes for a drawing buffer of w x h pixels. */
  private sizesFor(w: number, h: number) {
    const aspect = w / h;
    const shorter = Math.min(w, h);
    const cap = Math.min(this.maxTexture, 4096);
    const dyeRes = Math.round(Math.min(this.quality.dye, Math.max(this.minDye, shorter * 1.5)));
    const fit = (s: [number, number]): [number, number] => {
      const k = Math.min(1, cap / Math.max(s[0], s[1]));
      return [Math.max(1, Math.round(s[0] * k)), Math.max(1, Math.round(s[1] * k))];
    };
    const dye = fit(sizeFor(dyeRes, aspect));
    return {
      aspect,
      sim: fit(sizeFor(this.quality.sim, aspect)),
      dye,
      props: [Math.max(1, dye[0] >> 1), Math.max(1, dye[1] >> 1)] as [number, number],
    };
  }

  private allocate(w: number, h: number) {
    const s = this.sizesFor(w, h);
    this.aspect = s.aspect;
    this.simSize = s.sim;
    this.dyeSize = s.dye;
    this.propSize = s.props;
    const [sw, sh] = s.sim;
    const [dw, dh] = s.dye;
    this.velocity = this.double(sw, sh, this.fmtFloat);
    this.pressure = this.double(sw, sh, this.fmtFloat);
    this.divergence = this.target(sw, sh, this.fmtFloat);
    this.curlT = this.target(sw, sh, this.fmtFloat);
    this.dye = this.double(dw, dh, this.fmtFloat);
    this.dyeA = this.target(dw, dh, this.fmtFloat);
    this.dyeB = this.target(dw, dh, this.fmtFloat);
    this.props = this.double(s.props[0], s.props[1], this.fmtProps);
  }

  private release() {
    for (const d of [this.velocity, this.pressure, this.dye, this.props]) {
      if (!d) continue;
      this.kill(d.read);
      this.kill(d.write);
    }
    this.kill(this.divergence);
    this.kill(this.curlT);
    this.kill(this.dyeA);
    this.kill(this.dyeB);
    this.dropHistory();
  }

  private dropHistory() {
    for (const s of [...this.undoStack, ...this.redoStack, ...this.pool]) {
      this.kill(s.dye);
      this.kill(s.props);
    }
    this.undoStack = [];
    this.redoStack = [];
    this.pool = [];
  }

  // ---------- low level drawing ----------

  private use(name: ProgramName) {
    const p = this.prog[name];
    this.gl.useProgram(p.program);
    this.current = p;
    return p.uniforms;
  }

  private bind(unit: number, t: Target) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    return unit;
  }

  private draw(target: Target | null, texel?: [number, number]) {
    const gl = this.gl;
    let w: number;
    let h: number;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      w = target.w;
      h = target.h;
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      w = gl.drawingBufferWidth;
      h = gl.drawingBufferHeight;
    }
    gl.viewport(0, 0, w, h);
    const u = this.current?.uniforms;
    if (u?.uTexel) {
      const t = texel ?? [1 / w, 1 / h];
      gl.uniform2f(u.uTexel, t[0], t[1]);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private pass(
    name: ProgramName,
    target: Target | null,
    setup: (u: Record<string, WebGLUniformLocation | null>, gl: WebGL2RenderingContext) => void,
    texel?: [number, number],
  ) {
    const u = this.use(name);
    setup(u, this.gl);
    this.draw(target, texel);
  }

  private copy(src: Target, dst: Target, value = 1) {
    this.pass('copy', dst, (u, gl) => {
      gl.uniform1i(u.uSource, this.bind(0, src));
      gl.uniform1f(u.uValue, value);
    });
  }

  private wipe(t: Target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // ---------- public: lifecycle ----------

  get lost() {
    return this.gl.isContextLost();
  }

  /**
   * Match the drawing buffer to the element (in device pixels). When the shape
   * of the canvas changes, the paint is resampled into new buffers so nothing
   * is lost (it stretches, like the classic engine did).
   */
  resize(pixelW: number, pixelH: number) {
    if (this.destroyed || this.lost) return;
    const w = Math.max(1, Math.round(pixelW));
    const h = Math.max(1, Math.round(pixelH));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.flush();
    const next = this.sizesFor(w, h);
    const close = (a: [number, number], b: [number, number]) =>
      Math.abs(a[0] - b[0]) <= Math.max(2, a[0] * 0.02) && Math.abs(a[1] - b[1]) <= Math.max(2, a[1] * 0.02);
    if (close(next.dye, this.dyeSize) && close(next.sim, this.simSize)) return;

    const old = { velocity: this.velocity, pressure: this.pressure, dye: this.dye, props: this.props, divergence: this.divergence, curl: this.curlT, a: this.dyeA, b: this.dyeB };
    this.dropHistory();
    this.allocate(w, h);
    this.copy(old.dye.read, this.dye.read);
    this.copy(old.props.read, this.props.read);
    this.copy(old.velocity.read, this.velocity.read);
    for (const d of [old.velocity, old.pressure, old.dye, old.props]) {
      this.kill(d.read);
      this.kill(d.write);
    }
    for (const t of [old.divergence, old.curl, old.a, old.b]) this.kill(t);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.lost) return;
    const gl = this.gl;
    this.release();
    this.kill(this.statsTarget);
    if (this.statsPbo) gl.deleteBuffer(this.statsPbo);
    if (this.statsSync) gl.deleteSync(this.statsSync);
    for (const p of Object.values(this.prog)) gl.deleteProgram(p.program);
    if (this.vs) gl.deleteShader(this.vs);
    if (this.quad) gl.deleteBuffer(this.quad);
    if (this.vao) gl.deleteVertexArray(this.vao);
    // The context itself is kept: React may mount a new engine on the same canvas.
  }

  setSettings(patch: Partial<EngineSettings>) {
    Object.assign(this.settings, patch);
  }

  clear() {
    this.epoch++;
    this.paintCount = 0;
    this.forceCount = 0;
    for (const d of [this.velocity, this.pressure, this.dye, this.props]) {
      this.wipe(d.read);
      this.wipe(d.write);
    }
    this.cellCount = 0;
  }

  /** True when the stats readout reflects the paint as it is now. */
  get statsFresh() {
    return this.statsEpoch === this.epoch;
  }

  // ---------- public: undo ----------

  private snapshot(): Snapshot {
    this.flush();
    const pooled = this.pool.pop();
    const s = pooled ?? {
      dye: this.target(this.dyeSize[0], this.dyeSize[1], this.fmtFloat),
      props: this.target(this.propSize[0], this.propSize[1], this.fmtByte),
    };
    this.copy(this.dye.read, s.dye);
    this.copy(this.props.read, s.props);
    return s;
  }

  private restore(s: Snapshot) {
    this.copy(s.dye, this.dye.read);
    this.copy(s.props, this.props.read);
    this.wipe(this.velocity.read);
    this.wipe(this.pressure.read);
  }

  pushUndo() {
    if (this.lost) return;
    this.undoStack.push(this.snapshot());
    while (this.undoStack.length > this.maxUndo) this.pool.push(this.undoStack.shift() as Snapshot);
    this.pool.push(...this.redoStack);
    this.redoStack = [];
  }

  undo() {
    this.epoch++;
    const s = this.undoStack.pop();
    if (!s || this.lost) return false;
    this.redoStack.push(this.snapshot());
    this.restore(s);
    this.pool.push(s);
    return true;
  }

  redo() {
    this.epoch++;
    const s = this.redoStack.pop();
    if (!s || this.lost) return false;
    this.undoStack.push(this.snapshot());
    this.restore(s);
    this.pool.push(s);
    return true;
  }

  // ---------- public: paint input ----------

  splatPaint(x: number, y: number, radius: number, paint: PaintSplat) {
    this.epoch++;
    const i = this.paintCount;
    this.paintSplats.set([x, y, radius, paint.strength], i * 4);
    this.paintColors.set(paint.color, i * 3);
    this.propSplats.set([x, y, radius, Math.min(1, paint.strength + 0.2)], i * 4);
    this.propValues.set([paint.metallic, paint.pearl, 1, paint.body], i * 4);
    this.paintCount++;
    if (this.paintCount >= BATCH) this.flushPaint();
  }

  /**
   * Push the paint. Forces are in canvas heights per second; radial pushes
   * outward. With `blend`, the paint is instead pulled toward (fx, fy), the
   * way a tool dragged through it carries it along.
   */
  splatForce(x: number, y: number, radius: number, fx: number, fy: number, radial = 0, blend = 0) {
    this.epoch++;
    const k = this.simSize[1];
    const i = this.forceCount;
    this.forceSplats.set([x, y, radius, blend], i * 4);
    this.forceValues.set([fx * k, fy * k, radial * k, 0], i * 4);
    this.forceCount++;
    if (this.forceCount >= BATCH) this.flushForces();
  }

  private flushPaint() {
    if (!this.paintCount) return;
    const gl = this.gl;
    const n = this.paintCount;
    this.paintCount = 0;
    this.pass('dyeSplat', this.dye.write, u => {
      gl.uniform1i(u.uTarget, this.bind(0, this.dye.read));
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform4fv(u.uSplats, this.paintSplats);
      gl.uniform3fv(u.uColors, this.paintColors);
      gl.uniform1i(u.uCount, n);
    });
    this.dye.swap();
    this.pass('propSplat', this.props.write, u => {
      gl.uniform1i(u.uTarget, this.bind(0, this.props.read));
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform4fv(u.uSplats, this.propSplats);
      gl.uniform4fv(u.uValues, this.propValues);
      gl.uniform1i(u.uCount, n);
    });
    this.props.swap();
  }

  private flushForces() {
    if (!this.forceCount) return;
    const gl = this.gl;
    const n = this.forceCount;
    this.forceCount = 0;
    this.pass('velocitySplat', this.velocity.write, u => {
      gl.uniform1i(u.uTarget, this.bind(0, this.velocity.read));
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform4fv(u.uSplats, this.forceSplats);
      gl.uniform4fv(u.uForces, this.forceValues);
      gl.uniform1i(u.uCount, n);
    });
    this.velocity.swap();
  }

  /** Apply queued splats before anything reads the paint or the flow. */
  private flush() {
    if (this.destroyed || this.lost) {
      this.paintCount = 0;
      this.forceCount = 0;
      return;
    }
    this.flushPaint();
    this.flushForces();
  }

  /**
   * Push paint outward from a point (rate in canvas heights^2 per second).
   * A pour spreads paint evenly in every direction. Air passes `reach` (how
   * far the push carries) and optionally an aim: `dir` and `focus`.
   */
  addSource(x: number, y: number, radius: number, rate: number, air?: { reach: number; dir?: [number, number]; focus?: number }) {
    if (this.sourceCount >= 8) return false;
    this.epoch++;
    const i = this.sourceCount * 4;
    this.sources[i] = x;
    this.sources[i + 1] = y;
    this.sources[i + 2] = radius;
    this.sources[i + 3] = rate;
    const dir = air?.dir ?? [0, 0];
    const len = Math.hypot(dir[0], dir[1]) || 1;
    this.sourceDirs[i] = dir[0] / len;
    this.sourceDirs[i + 1] = dir[1] / len;
    this.sourceDirs[i + 2] = air?.dir ? air.focus ?? 4 : 0;
    this.sourceDirs[i + 3] = air?.reach ?? 0;
    this.sourceCount++;
    return true;
  }

  splatCells(x: number, y: number, radius: number, o: CellOptions) {
    this.epoch++;
    this.flush();
    const gl = this.gl;
    const cellSize = 0.012 + o.amount * 0.03 + Math.random() * 0.01;
    const density = 0.25 + o.amount * 0.6;
    const seed = Math.random() * 1000;
    const pal = o.palette.slice(0, 8);
    pal.forEach((c, i) => this.paletteBuf.set(c, i * 3));
    this.pass('cellDye', this.dye.write, u => {
      gl.uniform1i(u.uTarget, this.bind(0, this.dye.read));
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform2f(u.uPoint, x, y);
      gl.uniform1f(u.uRadius, radius);
      gl.uniform1f(u.uCellSize, cellSize);
      gl.uniform1f(u.uDensity, density);
      gl.uniform1f(u.uSeed, seed);
      gl.uniform1f(u.uStrength, o.strength);
      gl.uniform3fv(u.uPalette, this.paletteBuf);
      gl.uniform1i(u.uPaletteCount, pal.length);
      gl.uniform3f(u.uCellColor, o.cellColor[0], o.cellColor[1], o.cellColor[2]);
      gl.uniform3f(u.uInnerColor, o.innerColor[0], o.innerColor[1], o.innerColor[2]);
    });
    this.dye.swap();
    this.pass('cellVelocity', this.velocity.write, u => {
      gl.uniform1i(u.uTarget, this.bind(0, this.velocity.read));
      gl.uniform1i(u.uDye, this.bind(1, this.dye.read));
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform2f(u.uPoint, x, y);
      gl.uniform1f(u.uRadius, radius);
      gl.uniform1f(u.uCellSize, cellSize);
      gl.uniform1f(u.uDensity, density);
      gl.uniform1f(u.uSeed, seed);
      gl.uniform1f(u.uKick, o.kick * this.simSize[1] * cellSize);
    });
    this.velocity.swap();
    // Roughly how many cells that splat opened.
    const area = Math.PI * radius * radius;
    this.cellCount += Math.max(1, Math.round((area / (cellSize * cellSize)) * density * 0.3));
  }

  /** Lay a picture down as dry, fully covering paint (used for saved pours). */
  loadImage(img: TexImageSource) {
    this.epoch++;
    this.paintCount = 0;
    this.forceCount = 0;
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const src = { tex, fbo: null as unknown as WebGLFramebuffer, w: 1, h: 1 };
    this.pass('image', this.dye.read, u => {
      gl.uniform1i(u.uSource, this.bind(0, src));
      gl.uniform1i(u.uProps, 0);
    });
    this.pass('image', this.props.read, u => {
      gl.uniform1i(u.uSource, this.bind(0, src));
      gl.uniform1i(u.uProps, 1);
    });
    gl.deleteTexture(tex);
    this.wipe(this.velocity.read);
    this.wipe(this.pressure.read);
    this.cellCount = 0;
  }

  // ---------- simulation ----------

  step(dt: number) {
    if (this.destroyed || this.lost || dt <= 0) {
      this.sourceCount = 0;
      return;
    }
    this.flush();
    const gl = this.gl;
    const st = this.settings;
    const simTexel: [number, number] = [1 / this.simSize[0], 1 / this.simSize[1]];
    this.time += dt;

    // Tipping or spinning the canvas thins the paint out so it covers more area.
    const spread = Math.hypot(st.tilt[0], st.tilt[1]) * 0.03 + Math.abs(st.spin) * 0.02;

    this.pass('force', this.velocity.write, u => {
      gl.uniform1i(u.uVelocity, this.bind(0, this.velocity.read));
      gl.uniform1i(u.uDye, this.bind(1, this.dye.read));
      gl.uniform1i(u.uProps, this.bind(2, this.props.read));
      gl.uniform1f(u.uAspect, this.aspect);
      // Most of the tilt moves paint through the downhill flow below; a small
      // share goes into the velocity so tipped paint still swirls.
      gl.uniform2f(u.uTilt, st.tilt[0] * 0.15, st.tilt[1] * 0.15);
      gl.uniform1f(u.uSpin, st.spin);
      gl.uniform1f(u.uDt, dt);
      gl.uniform1f(u.uSimScale, this.simSize[1]);
      gl.uniform1f(u.uWander, st.wander);
      gl.uniform1f(u.uTime, this.time);
      gl.uniform1f(u.uDamping, st.damping);
    });
    this.velocity.swap();

    if (st.curl > 0.01) {
      this.pass('curl', this.curlT, u => {
        gl.uniform1i(u.uVelocity, this.bind(0, this.velocity.read));
      });
      this.pass('vorticity', this.velocity.write, u => {
        gl.uniform1i(u.uVelocity, this.bind(0, this.velocity.read));
        gl.uniform1i(u.uCurl, this.bind(1, this.curlT));
        gl.uniform1f(u.uCurlStrength, st.curl);
        gl.uniform1f(u.uDt, dt);
      });
      this.velocity.swap();
    }

    this.pass('divergence', this.divergence, u => {
      gl.uniform1i(u.uVelocity, this.bind(0, this.velocity.read));
      gl.uniform1i(u.uDye, this.bind(1, this.dye.read));
      gl.uniform1f(u.uSpread, spread);
    });
    this.copy(this.pressure.read, this.pressure.write, 0.85);
    this.pressure.swap();
    for (let i = 0; i < this.quality.iterations; i++) {
      this.pass('pressure', this.pressure.write, u => {
        gl.uniform1i(u.uPressure, this.bind(0, this.pressure.read));
        gl.uniform1i(u.uDivergence, this.bind(1, this.divergence));
      });
      this.pressure.swap();
    }
    this.pass('gradient', this.velocity.write, u => {
      gl.uniform1i(u.uPressure, this.bind(0, this.pressure.read));
      gl.uniform1i(u.uVelocity, this.bind(1, this.velocity.read));
    });
    this.velocity.swap();

    // Downhill flow (canvas heights per second): thinner paint runs faster.
    const tiltGain = 0.55 / (1 + st.damping);
    const tiltFlow = [st.tilt[0] * tiltGain, st.tilt[1] * tiltGain];
    // Turntable creep: speed grows with the square of the spin.
    const spinFlow = 0.006 * st.spin * st.spin;
    const sources = (u: Record<string, WebGLUniformLocation | null>) => {
      gl.uniform4fv(u.uSources, this.sources);
      gl.uniform4fv(u.uSourceDirs, this.sourceDirs);
      gl.uniform1i(u.uSourceCount, this.sourceCount);
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform1f(u.uSpinFlow, spinFlow);
      gl.uniform1f(u.uSpinSwirl, -0.4 * Math.sign(st.spin));
      gl.uniform2f(u.uTiltFlow, tiltFlow[0], tiltFlow[1]);
      gl.uniform1f(u.uTiltReach, 0.3);
      gl.uniform1i(u.uCover, this.bind(6, this.dye.read));
      gl.uniform1i(u.uWet, this.bind(7, this.props.read));
    };
    const advect = (src: Target, dst: Target, signedDt: number, decay: [number, number, number, number]) => {
      this.pass('advect', dst, u => {
        gl.uniform1i(u.uVelocity, this.bind(0, this.velocity.read));
        gl.uniform1i(u.uSource, this.bind(1, src));
        gl.uniform2f(u.uSimTexel, simTexel[0], simTexel[1]);
        gl.uniform1f(u.uDt, signedDt);
        gl.uniform4f(u.uDecay, decay[0], decay[1], decay[2], decay[3]);
        sources(u);
      });
    };
    const none: [number, number, number, number] = [0, 0, 0, 0];

    // Velocity carries itself along.
    advect(this.velocity.read, this.velocity.write, dt, none);
    this.velocity.swap();

    // Paint: MacCormack advection keeps the boundaries between colors sharp.
    advect(this.dye.read, this.dyeA, dt, none);
    advect(this.dyeA, this.dyeB, -dt, none);
    this.pass('maccormack', this.dye.write, u => {
      gl.uniform1i(u.uVelocity, this.bind(0, this.velocity.read));
      gl.uniform1i(u.uSource, this.bind(1, this.dye.read));
      gl.uniform1i(u.uForward, this.bind(2, this.dyeA));
      gl.uniform1i(u.uBackward, this.bind(3, this.dyeB));
      gl.uniform2f(u.uSimTexel, simTexel[0], simTexel[1]);
      gl.uniform2f(u.uDyeTexel, 1 / this.dyeSize[0], 1 / this.dyeSize[1]);
      gl.uniform2f(u.uDyeSize, this.dyeSize[0], this.dyeSize[1]);
      gl.uniform1f(u.uDt, dt);
      sources(u);
    });
    this.dye.swap();

    this.pass('tension', this.dye.write, u => {
      gl.uniform1i(u.uSource, this.bind(0, this.dye.read));
      gl.uniform1i(u.uProps, this.bind(1, this.props.read));
      gl.uniform1f(u.uStrength, st.tension);
      gl.uniform1f(u.uMix, st.mix);
      gl.uniform1f(u.uSharpen, st.sharpen);
      gl.uniform1f(u.uDt, dt);
    });
    this.dye.swap();

    // Paint properties ride along with the paint. Drying is applied in small
    // lumps because half floats can't hold a tiny per-frame change near 1.0.
    this.dryClock += dt;
    let dry = 0;
    if (this.dryClock * st.dryRate >= 0.004 || this.dryClock > 1) {
      dry = (st.dryRate * this.dryClock) / dt;
      this.dryClock = 0;
    }
    advect(this.props.read, this.props.write, dt, [0, 0, dry, 0]);
    this.props.swap();

    this.sourceCount = 0;
  }

  // ---------- output ----------

  private renderTo(target: Target | null, transparent: boolean, pixels: [number, number]) {
    this.flush();
    const gl = this.gl;
    const st = this.settings;
    const b = st.surface;
    this.pass('display', target, u => {
      gl.uniform1i(u.uDye, this.bind(0, this.dye.read));
      gl.uniform1i(u.uProps, this.bind(1, this.props.read));
      gl.uniform3f(u.uBase, b[0], b[1], b[2]);
      gl.uniform2f(u.uDyeTexel, 1 / this.dyeSize[0], 1 / this.dyeSize[1]);
      gl.uniform1f(u.uGloss, st.gloss);
      gl.uniform1f(u.uAspect, this.aspect);
      gl.uniform1f(u.uWeave, st.weave);
      gl.uniform2f(u.uPixels, pixels[0], pixels[1]);
      gl.uniform1i(u.uTransparent, transparent ? 1 : 0);
    });
  }

  render() {
    if (this.destroyed || this.lost) return;
    this.renderTo(null, false, [this.canvas.width, this.canvas.height]);
  }

  /** Largest export the device can make while keeping the aspect ratio. */
  exportLimit(w: number, h: number): [number, number] {
    const maxSide = Math.min(this.maxTexture, 8192);
    const k = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(40_000_000 / (w * h)));
    return [Math.max(1, Math.floor(w * k)), Math.max(1, Math.floor(h * k))];
  }

  /** Render the pour into a new 2D canvas at any size (print exports, gallery snapshots). */
  exportCanvas(width: number, height: number, transparent = false): HTMLCanvasElement | null {
    if (this.destroyed || this.lost) return null;
    const gl = this.gl;
    const [w, h] = this.exportLimit(width, height);
    const out = this.target(w, h, { ...this.fmtByte, filter: gl.NEAREST });
    // The canvas weave and sparkle keep their on-screen scale at any size.
    this.renderTo(out, transparent, [this.canvas.width, this.canvas.height]);
    const pixels = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    this.kill(out);
    const c2 = document.createElement('canvas');
    c2.width = w;
    c2.height = h;
    const ctx = c2.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(w, h);
    // WebGL rows are bottom-up; flip into the 2D canvas.
    const row = w * 4;
    for (let y = 0; y < h; y++) img.data.set(pixels.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    return c2;
  }

  /**
   * Live coverage readout without stalling the GPU: render a tiny summary,
   * read it into a buffer, and pick the numbers up on a later frame.
   */
  updateStats() {
    if (this.destroyed || this.lost) return;
    const gl = this.gl;
    if (this.statsSync) {
      const status = gl.clientWaitSync(this.statsSync, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) return;
      gl.deleteSync(this.statsSync);
      this.statsSync = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.statsPbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.statsPixels);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      let cov = 0;
      let wet = 0;
      const px = this.statsPixels;
      for (let i = 0; i < px.length; i += 4) {
        cov += px[i];
        wet += px[i + 1];
      }
      const n = (px.length / 4) * 255;
      this.stats = { coverage: cov / n, wet: wet / n };
      this.statsEpoch = this.pendingEpoch;
      return;
    }
    this.pass('stats', this.statsTarget, u => {
      gl.uniform1i(u.uDye, this.bind(0, this.dye.read));
      gl.uniform1i(u.uProps, this.bind(1, this.props.read));
    });
    if (!this.statsPbo) {
      this.statsPbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.statsPbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.statsPixels.byteLength, gl.STREAM_READ);
    } else {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.statsPbo);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.statsTarget.fbo);
    gl.readPixels(0, 0, STATS_W, STATS_H, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.statsSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.pendingEpoch = this.epoch;
    gl.flush();
  }
}
