// GLSL ES 3.00 shaders for the GPU paint simulation (WebGL2).
//
// Units: velocity is stored in simulation texels per second. Any pass that
// moves something along the flow multiplies by uSimTexel to get UV offsets,
// so paint and velocity can live at different resolutions.
//
// Paint ("dye") is premultiplied and in linear light:
//   rgb = color * coverage, a = coverage (0 = bare canvas, 1 = fully covered).
// Paint properties ("props") travel with the paint:
//   r = metallic, g = pearl, b = wetness (1 fresh, 0 dry), a = body (thickness).

export const baseVertex = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 uTexel;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0);
  vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y);
  vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const header = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
`;

const hashLib = `
vec2 hash22 (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash12 (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// Voronoi cells shared by the color and velocity cell passes so both agree on
// where each cell is. Returns x = distance / cell radius (1.0 = cell edge),
// y = cell radius, zw = offset from the cell center (in cell units).
const cellLib = hashLib + `
vec4 cellAt (vec2 p, float seed, float density) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float best = 1e5;
  float bestR = 0.0;
  vec2 bestOff = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 id = i + g + seed;
      vec2 o = hash22(id);
      if (hash12(id * 1.37 + 4.1) > density) continue;
      vec2 off = f - (g + 0.15 + o * 0.7);
      float d = length(off);
      float r = 0.16 + 0.32 * hash12(id + 9.7);
      if (d / r < best) {
        best = d / r;
        bestR = r;
        bestOff = off;
      }
    }
  }
  return vec4(best, bestR, bestOff);
}
`;

// Sources push paint outward from a point without going through the
// pressure solve (so the push isn't cancelled out):
// - a pour: paint spreading from where it lands. The exact 2D point-source
//   flow, u = Q/(2*pi) * r/|r|^2, softened near the center.
// - air (a blower or straw): the same flow, but fading out with distance
//   (uSourceDirs.w = reach) and optionally aimed (xy = direction, z = focus).
// - the turntable: wet paint creeps outward from the center, faster the
//   farther out it is, curving against the spin. Dry paint stays put.
// - tilt: wet paint runs downhill where there is paint uphill feeding it.
//   The uphill edge of a puddle stays pinned to the canvas, so tipping the
//   canvas stretches the pour toward the low side instead of sliding it.
const sourceLib = `
uniform vec4 uSources[8];
uniform vec4 uSourceDirs[8];
uniform int uSourceCount;
uniform float uAspect;
uniform float uSpinFlow;
uniform float uSpinSwirl;
uniform vec2 uTiltFlow;
uniform float uTiltReach;
uniform sampler2D uCover;
uniform sampler2D uWet;
vec2 sourceFlow (vec2 uv) {
  vec2 u = vec2(0.0);
  float tl = length(uTiltFlow);
  if (tl > 0.0) {
    vec2 back = uTiltFlow / tl * uTiltReach;
    back.x /= uAspect;
    // How much paint lies uphill, out to uTiltReach. Paint with a long run of
    // paint behind it moves fastest, so the flow speeds up across a puddle
    // and the whole pattern stretches downhill, while the uphill edge holds.
    float uphill = 0.0;
    for (int k = 1; k <= 6; k++) {
      uphill += clamp(texture(uCover, uv - back * (float(k) / 6.0)).a, 0.0, 1.0);
    }
    uphill = smoothstep(0.0, 1.0, uphill / 6.0);
    float here = clamp(texture(uCover, uv).a, 0.0, 1.0);
    vec4 pr = texture(uWet, uv);
    float mobile = uphill * mix(1.0, smoothstep(0.0, 0.35, pr.b), here);
    float body = mix(1.0, 0.5 + 1.5 * pr.a, here);
    u += uTiltFlow * mobile / body;
  }
  if (uSpinFlow > 0.0) {
    vec2 r = uv - 0.5;
    r.x *= uAspect;
    float cover = clamp(texture(uCover, uv).a, 0.0, 1.0);
    float mobile = mix(1.0, smoothstep(0.0, 0.35, texture(uWet, uv).b), cover);
    u += uSpinFlow * mobile * (r + uSpinSwirl * vec2(-r.y, r.x));
  }
  for (int i = 0; i < 8; i++) {
    if (i >= uSourceCount) break;
    vec4 s = uSources[i];
    vec4 d = uSourceDirs[i];
    vec2 p = uv - s.xy;
    p.x *= uAspect;
    float r2 = dot(p, p);
    float w = 1.0;
    if (d.z > 0.0) {
      float c = dot(p, d.xy) * inversesqrt(r2 + 1e-8);
      w = pow(max(0.0, 0.5 + 0.5 * c), d.z) * (d.z + 1.0);
    }
    if (d.w > 0.0) w *= exp(-r2 / (d.w * d.w));
    u += s.w * 0.15915 * w * p / (r2 + s.z * s.z);
  }
  u.x /= uAspect;
  return u;
}
`;

export const copyShader = header + `
uniform sampler2D uSource;
uniform float uValue;
void main () {
  fragColor = texture(uSource, vUv) * uValue;
}`;

// A loaded picture becomes fully covering, dry paint.
export const imageShader = header + `
uniform sampler2D uSource;
uniform int uProps;
void main () {
  if (uProps == 1) {
    fragColor = vec4(0.0, 0.0, 0.0, 0.33);
    return;
  }
  vec3 c = pow(texture(uSource, vUv).rgb, vec3(2.2));
  fragColor = vec4(c, 1.0);
}`;

// Splats are batched: up to 16 per pass, applied in order, so a fast drag
// or a burst of droplets costs one pass instead of dozens.

// Paint deposit. Crisp edge: paint has surface tension, it doesn't feather.
// Translucent paints (pouring medium, gloss medium) glaze over what's below.
export const dyeSplatShader = header + `
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec4 uSplats[16];
uniform vec3 uColors[16];
uniform int uCount;
void main () {
  vec4 base = texture(uTarget, vUv);
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    vec4 s = uSplats[i];
    vec2 p = vUv - s.xy;
    p.x *= uAspect;
    float w = smoothstep(s.z, s.z * 0.82, length(p)) * s.w;
    base = mix(base, vec4(uColors[i], 1.0), w);
  }
  fragColor = base;
}`;

// Paint properties for each splat: metallic, pearl, wetness, body.
export const propSplatShader = header + `
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec4 uSplats[16];
uniform vec4 uValues[16];
uniform int uCount;
void main () {
  vec4 base = texture(uTarget, vUv);
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    vec4 s = uSplats[i];
    vec2 p = vUv - s.xy;
    p.x *= uAspect;
    float edge = smoothstep(s.z, s.z * 0.82, length(p));
    vec4 next = mix(base, uValues[i], edge * s.w);
    // Fresh paint re-wets whatever it lands on.
    next.b = max(next.b, uValues[i].b * edge);
    base = next;
  }
  fragColor = base;
}`;

// Push the paint. Each splat has a directional push (xy) and an outward
// push (z), in sim texels per second. Velocity is stored in square sim
// texels, so forces need no aspect fix. With a blend (splat w > 0), a tool
// dragged through the paint carries it along at the tool's own speed
// instead (it can't fling paint faster than it moves).
export const velocitySplatShader = header + `
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec4 uSplats[16];
uniform vec4 uForces[16];
uniform int uCount;
void main () {
  vec2 v = texture(uTarget, vUv).xy;
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    vec4 s = uSplats[i];
    vec4 F = uForces[i];
    vec2 p = vUv - s.xy;
    p.x *= uAspect;
    float d = length(p);
    float w = exp(-d * d / (s.z * s.z));
    vec2 dir = d > 1e-5 ? p / d : vec2(0.0);
    vec2 f = F.xy + dir * F.z;
    if (s.w > 0.0) v = mix(v, f, clamp(w * s.w, 0.0, 1.0));
    else v += f * w;
  }
  fragColor = vec4(v, 0.0, 1.0);
}`;

// Cells: lower layers break through the top coat as rounded cells with a
// darker lacing ring. They only form where there is paint to break through.
export const cellDyeShader = header + cellLib + `
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uCellSize;
uniform float uDensity;
uniform float uSeed;
uniform float uStrength;
uniform vec3 uPalette[8];
uniform int uPaletteCount;
uniform vec3 uCellColor;
uniform vec3 uInnerColor;
void main () {
  vec4 base = texture(uTarget, vUv);
  vec2 q = vUv - uPoint;
  q.x *= uAspect;
  float mask = smoothstep(uRadius, uRadius * 0.6, length(q)) * smoothstep(0.15, 0.6, base.a);
  if (mask <= 0.0) { fragColor = base; return; }
  vec2 cp = vec2(vUv.x * uAspect, vUv.y) / uCellSize;
  vec4 c = cellAt(cp, uSeed, uDensity);
  float rel = c.x;
  float inside = smoothstep(1.0, 0.82, rel);
  float lace = smoothstep(1.35, 1.0, rel) - inside;
  vec2 id = floor(cp - c.zw) + uSeed;
  float pick = hash12(id * 3.1 + 1.7);
  vec3 cellColor = uCellColor;
  if (pick > 0.6 && uPaletteCount > 0) {
    int k = int(floor(hash12(id * 7.3) * float(uPaletteCount)));
    for (int i = 0; i < 8; i++) { if (i == k) cellColor = uPalette[i]; }
  }
  vec3 top = base.rgb / max(base.a, 1e-3);
  // Some cells show a second, smaller ring (the classic silicone look).
  float inner = smoothstep(0.42, 0.3, rel) * step(0.55, hash12(id + 2.3));
  vec3 col = mix(top, top * 0.4, lace * 0.85);
  col = mix(col, cellColor, inside);
  col = mix(col, uInnerColor, inner * 0.85);
  float k2 = mask * uStrength;
  vec3 outCol = mix(top, col, k2);
  float a = max(base.a, k2 * inside);
  fragColor = vec4(outCol * a, a);
}`;

// Cells open up as they form, nudging paint outward from each center.
export const cellVelocityShader = header + cellLib + `
uniform sampler2D uTarget;
uniform sampler2D uDye;
uniform float uAspect;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uCellSize;
uniform float uDensity;
uniform float uSeed;
uniform float uKick;
void main () {
  vec2 v = texture(uTarget, vUv).xy;
  vec2 q = vUv - uPoint;
  q.x *= uAspect;
  float cov = texture(uDye, vUv).a;
  float mask = smoothstep(uRadius, uRadius * 0.6, length(q)) * smoothstep(0.15, 0.6, cov);
  if (mask > 0.0) {
    vec2 cp = vec2(vUv.x * uAspect, vUv.y) / uCellSize;
    vec4 c = cellAt(cp, uSeed, uDensity);
    float ring = smoothstep(1.5, 0.9, c.x);
    vec2 dir = length(c.zw) > 1e-4 ? normalize(c.zw) : vec2(0.0);
    v += dir * ring * uKick * mask;
  }
  fragColor = vec4(v, 0.0, 1.0);
}`;

// Semi-Lagrangian advection. Anything flowing in from beyond the canvas edge
// is bare canvas (0), so paint that runs off the edge is gone, like real life.
// uDecay is subtracted per second (used to dry the paint over time).
export const advectShader = header + sourceLib + `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uSimTexel;
uniform float uDt;
uniform vec4 uDecay;
void main () {
  vec2 coord = vUv - uDt * (texture(uVelocity, vUv).xy * uSimTexel + sourceFlow(vUv));
  vec4 s = texture(uSource, coord);
  if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) s = vec4(0.0);
  fragColor = max(s - uDecay * abs(uDt), vec4(0.0));
}`;

// MacCormack correction: phiHat = forward(phi), phiBar = backward(phiHat).
// Result = phiHat + (phi - phiBar) / 2, clamped to the texels the forward
// step sampled. This keeps the boundaries between colors crisp.
export const maccormackShader = header + sourceLib + `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform sampler2D uForward;
uniform sampler2D uBackward;
uniform vec2 uSimTexel;
uniform vec2 uDyeTexel;
uniform vec2 uDyeSize;
uniform float uDt;
void main () {
  vec2 coord = vUv - uDt * (texture(uVelocity, vUv).xy * uSimTexel + sourceFlow(vUv));
  vec4 phiHat = texture(uForward, vUv);
  if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) {
    fragColor = phiHat;
    return;
  }
  vec4 phi = texture(uSource, vUv);
  vec4 phiBar = texture(uBackward, vUv);
  vec4 corrected = phiHat + 0.5 * (phi - phiBar);
  vec2 st = coord * uDyeSize - 0.5;
  vec2 i = floor(st) + 0.5;
  vec4 a = texture(uSource, i * uDyeTexel);
  vec4 b = texture(uSource, (i + vec2(1.0, 0.0)) * uDyeTexel);
  vec4 c = texture(uSource, (i + vec2(0.0, 1.0)) * uDyeTexel);
  vec4 d = texture(uSource, (i + vec2(1.0, 1.0)) * uDyeTexel);
  vec4 lo = min(min(a, b), min(c, d));
  vec4 hi = max(max(a, b), max(c, d));
  fragColor = clamp(corrected, lo, hi);
}`;

// Forces on the paint, weighted by how much wet paint is there:
// tilt = gravity along the slope, spin = centrifugal + coriolis, plus a slow
// drifting swirl so pours wander organically instead of making perfect
// circles. Also applies viscous damping (thicker paint and drying paint
// resist movement) and a speed limit.
export const forceShader = header + hashLib + `
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform sampler2D uProps;
uniform float uAspect;
uniform vec2 uTilt;
uniform float uSpin;
uniform float uDt;
uniform float uSimScale;
uniform float uWander;
uniform float uTime;
uniform float uDamping;
float noise (vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float psi (vec2 p) {
  return noise(p) + 0.5 * noise(p * 2.03 + 7.1);
}
void main () {
  vec2 v = texture(uVelocity, vUv).xy;
  float cov = clamp(texture(uDye, vUv).a, 0.0, 1.0);
  vec4 props = texture(uProps, vUv);
  float wet = smoothstep(0.0, 0.35, props.b);
  float body = mix(1.0, 0.5 + 1.5 * props.a, cov);
  float drive = cov * wet;
  vec2 r = vUv - 0.5;
  r.x *= uAspect;
  // Forces in canvas heights per second^2 (x in height units too).
  vec2 f = uTilt;
  // Most of the spin's outward push is the turntable creep in sourceFlow;
  // a little here roughens the edge into fingers.
  f += uSpin * uSpin * r * 0.04;
  vec2 q = r * 9.0 + vec2(uTime * 0.07, -uTime * 0.05);
  float e = 0.05;
  vec2 w = vec2(psi(q + vec2(0.0, e)) - psi(q - vec2(0.0, e)), -(psi(q + vec2(e, 0.0)) - psi(q - vec2(e, 0.0)))) / (2.0 * e);
  f += w * uWander * 0.02;
  v += f * uSimScale * drive / body * uDt;
  // Coriolis turns moving paint into spiral arms on a spinning canvas.
  v += 0.3 * uSpin * vec2(v.y, -v.x) * drive * uDt;
  // Viscous drag. Thick paint drags more; drying paint locks in place.
  float drag = uDamping * body + cov * (1.0 - wet) * 30.0;
  v /= 1.0 + drag * uDt;
  float sp = length(v);
  float maxSp = uSimScale * 0.9;
  if (sp > maxSp) v *= maxSp / sp;
  fragColor = vec4(v, 0.0, 1.0);
}`;

export const curlShader = header + `
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

export const vorticityShader = header + `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + force * uDt;
  fragColor = vec4(v, 0.0, 1.0);
}`;

// Divergence of the flow. Leveling: when the canvas is tipped or spun, paint
// thins out and covers more area, modeled as a gentle source wherever there
// is wet paint.
export const divergenceShader = header + `
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform float uSpread;
void main () {
  vec2 C = texture(uVelocity, vUv).xy;
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  if (vL.x < 0.0) L = C.x;
  if (vR.x > 1.0) R = C.x;
  if (vT.y > 1.0) T = C.y;
  if (vB.y < 0.0) B = C.y;
  float div = 0.5 * (R - L + T - B);
  div -= uSpread * clamp(texture(uDye, vUv).a, 0.0, 1.0);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

// Jacobi pressure solve. Pressure is 0 beyond the canvas edge (open edge).
export const pressureShader = header + `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
float P (vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uPressure, uv).x;
}
void main () {
  float div = texture(uDivergence, vUv).x;
  float p = (P(vL) + P(vR) + P(vT) + P(vB) - div) * 0.25;
  fragColor = vec4(p, 0.0, 0.0, 1.0);
}`;

export const gradientSubtractShader = header + `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
float P (vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uPressure, uv).x;
}
void main () {
  vec2 v = texture(uVelocity, vUv).xy;
  v -= 0.5 * vec2(P(vR) - P(vL), P(vT) - P(vB));
  fragColor = vec4(v, 0.0, 1.0);
}`;

// Surface tension and pigment mixing.
// Coverage wants to be all-or-nothing (crisp, rounded edges, no smoky wisps).
// uMix blends neighboring wet colors (Pigment mixing slider); with it low,
// colors stay marbled with sharp boundaries. Dry paint no longer mixes.
export const tensionShader = header + `
uniform sampler2D uSource;
uniform sampler2D uProps;
uniform float uStrength;
uniform float uMix;
uniform float uSharpen;
uniform float uDt;
vec3 colorOf (vec4 p) { return p.rgb / max(p.a, 1e-3); }
void main () {
  vec4 c = texture(uSource, vUv);
  vec4 sL = texture(uSource, vL);
  vec4 sR = texture(uSource, vR);
  vec4 sT = texture(uSource, vT);
  vec4 sB = texture(uSource, vB);
  float wet = smoothstep(0.0, 0.3, texture(uProps, vUv).b);
  vec4 blur = (sL + sR + sT + sB) * 0.25;
  vec4 d = c + (blur - c) * clamp(uMix * wet * uDt, 0.0, 1.0);
  float a = clamp(d.a, 0.0, 1.0);
  float na = clamp(a + uDt * uStrength * (0.25 + 0.75 * wet) * a * (1.0 - a) * (a - 0.45), 0.0, 1.0);
  if (na < 0.02) na = 0.0;
  vec3 col = colorOf(d);
  // Keep the boundaries between wet colors crisp: a gentle anti-blur inside
  // fully covered paint, limited to the neighbors' range so it never rings.
  if (uSharpen > 0.0 && min(min(sL.a, sR.a), min(sT.a, sB.a)) > 0.85) {
    vec3 cL = colorOf(sL);
    vec3 cR = colorOf(sR);
    vec3 cT = colorOf(sT);
    vec3 cB = colorOf(sB);
    vec3 lo = min(min(min(cL, cR), min(cT, cB)), col);
    vec3 hi = max(max(max(cL, cR), max(cT, cB)), col);
    vec3 avg = (cL + cR + cT + cB) * 0.25;
    col = clamp(col + (col - avg) * clamp(uSharpen * wet * uDt, 0.0, 0.5), lo, hi);
  }
  fragColor = vec4(col * na, na);
}`;

// Small render of coverage and wetness used for the live stats readout.
export const statsShader = header + `
uniform sampler2D uDye;
uniform sampler2D uProps;
void main () {
  float a = clamp(texture(uDye, vUv).a, 0.0, 1.0);
  float wet = texture(uProps, vUv).b;
  fragColor = vec4(a, a * step(0.05, wet), 0.0, 1.0);
}`;

// Final look: canvas surface + paint, wet gloss from the paint surface,
// metallic sparkle and pearl shimmer, and a faint canvas weave.
export const displayShader = header + hashLib + `
uniform sampler2D uDye;
uniform sampler2D uProps;
uniform vec3 uBase;
uniform vec2 uDyeTexel;
uniform float uGloss;
uniform float uAspect;
uniform float uWeave;
uniform vec2 uPixels;
uniform int uTransparent;
float height (vec2 uv) {
  vec4 d = texture(uDye, uv);
  float a = clamp(d.a, 0.0, 1.0);
  vec3 c = d.rgb / max(d.a, 1e-3);
  return a * 0.8 + dot(c, vec3(0.299, 0.587, 0.114)) * a * 0.03;
}
void main () {
  vec4 d = texture(uDye, vUv);
  float a = clamp(d.a, 0.0, 1.0);
  vec3 paint = d.rgb / max(d.a, 1e-3);
  vec4 props = texture(uProps, vUv);

  // Canvas weave, strongest on bare canvas, faint through thin paint.
  vec2 wp = vUv * uPixels / 3.0;
  float weave = (sin(wp.x * 3.14159) * 0.5 + 0.5) * (sin(wp.y * 3.14159) * 0.5 + 0.5);
  vec3 base = uBase * (1.0 - uWeave * 0.07 * weave);
  // Soft studio light from the top left, like the classic canvas look.
  base *= mix(1.03, 0.93, (vUv.x + 1.0 - vUv.y) * 0.5);
  vec3 col = uTransparent == 1 ? paint : mix(base, paint, a);

  vec2 e = uDyeTexel * 1.5;
  float hx = height(vUv + vec2(e.x, 0.0)) - height(vUv - vec2(e.x, 0.0));
  float hy = height(vUv + vec2(0.0, e.y)) - height(vUv - vec2(0.0, e.y));
  vec3 n = normalize(vec3(-hx * 4.0, -hy * 4.0, 1.0));
  vec3 L = normalize(vec3(-0.35, 0.55, 1.0));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 90.0);
  float broad = pow(clamp(dot(n, H), 0.0, 1.0), 12.0);

  // Props are stored at half resolution; firm them up so shine doesn't bleed
  // onto neighboring colors.
  float metal = smoothstep(0.35, 0.8, props.r) * a;
  float pearl = smoothstep(0.35, 0.8, props.g) * a;
  float wet = props.b;

  // Metallic: brighter highlights, darker off-angle, fine mica sparkle.
  float sparkle = step(0.985, hash12(floor(vUv * uPixels * 0.6)));
  col *= mix(1.0, 0.65 + 0.9 * broad, metal);
  col += metal * sparkle * 0.5 * (0.4 + broad);
  // Pearl: angle-dependent rainbow tint.
  float ang = (n.x * 3.0 + n.y * 2.0) * 4.0 + vUv.x * 2.0;
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + ang));
  col = mix(col, col * 0.75 + irid * irid * 0.35, pearl * 0.55);

  col *= 0.9 + 0.1 * diff;
  // Wet paint is glossier than dry paint.
  float gloss = uGloss * mix(0.5, 1.0, wet);
  col += vec3(1.0) * spec * gloss * 0.5 * a;
  if (uTransparent == 0) {
    float sheen = smoothstep(0.9, 0.0, length((vUv - vec2(0.3, 0.75)) * vec2(uAspect, 1.0)));
    col += vec3(1.0) * sheen * 0.03 * uGloss;
  }
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColor = vec4(col, uTransparent == 1 ? a : 1.0);
}`;
