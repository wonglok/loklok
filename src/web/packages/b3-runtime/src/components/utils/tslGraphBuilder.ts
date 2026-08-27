"use client";

import * as THREE from "three/webgpu";
import {
  vec2,
  vec3,
  texture as tslTexture,
  uv as tslUV,
  float,
  color,
  clamp,
  mix,
  smoothstep,
  step,
  pow,
  log,
  sqrt,
  abs,
  exp,
  min,
  max,
  sign,
  round,
  floor,
  ceil,
  trunc,
  fract,
  mod,
  add,
  sub,
  mul,
  div,
  sin,
  cos,
  dot,
  cross,
  length,
  normalize,
  distance,
  reflect,
  refract,
  select,
  remap,
  luminance,
  saturation,
  checker,
  mx_noise_float,
  mx_worley_noise_float,
  mx_fractal_noise_float,
  triNoise3D,
  rotate,
  normalMap,
  bumpMap,
  blendScreen,
  blendOverlay,
  blendBurn,
  blendDodge,
  mx_hsvtorgb,
  mx_rgbtohsv,
  oneMinus,
  oscSine,
  oscTriangle,
  oscSawtooth,
  attribute,
  vertexColor,
  positionLocal,
  positionWorld,
  normalLocal,
  normalWorld,
  normalView,
  positionViewDirection,
  tangentWorld,
  screenUV,
  reflectView,
  objectPosition,
  faceDirection,
  hash,
  int,
  bool,
  rand,
} from "three/tsl";
import type {
  ShaderGraph,
  BlenderNode,
  ColorStop,
  CurveData,
} from "../types/shaderGraph";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface TSLMaterialParams {
  geometry: THREE.BufferGeometry;
  /** Serialised Blender shader node graph — when present, drives the material. */
  graph?: ShaderGraph;
  /** Resolve a TEX_IMAGE name → THREE.Texture (colour space from the node). */
  resolveImage?: (
    name: string,
    kind: "color" | "noncolor",
  ) => THREE.Texture | null;
  color: [number, number, number];
  roughness: number;
  metalness: number;
  emissiveColor: [number, number, number];
  emissiveIntensity: number;
  map: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  metalnessMap: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  emissiveMap: THREE.Texture | null;
  transparent: boolean;
  opacity: number;
  alphaTest: number;
  flatShading: boolean;
  transmission: number;
  transmissionMap: THREE.Texture | null;
  thickness: number;
  thicknessMap: THREE.Texture | null;
  ior: number;
  clearcoat: number;
  clearcoatRoughness: number;
  clearcoatMap: THREE.Texture | null;
  clearcoatRoughnessMap: THREE.Texture | null;
  clearcoatNormalMap: THREE.Texture | null;
  sheen: number;
  sheenRoughness: number;
  sheenColor: [number, number, number];
  sheenColorMap: THREE.Texture | null;
  sheenRoughnessMap: THREE.Texture | null;
  specularIntensity: number;
  specularColor: [number, number, number];
  specularColorMap: THREE.Texture | null;
  specularIntensityMap: THREE.Texture | null;
  iridescence: number;
  iridescenceMap: THREE.Texture | null;
  iridescenceIOR: number;
  iridescenceThicknessRange: [number, number];
  iridescenceThicknessMap: THREE.Texture | null;
  anisotropy: number;
  anisotropyMap: THREE.Texture | null;
  attenuationDistance: number;
  attenuationColor: [number, number, number];
}

// ---------------------------------------------------------------------------
// Value model — how socket values flow through the evaluator
// ---------------------------------------------------------------------------

type NodeValue =
  | number
  | number[]
  | THREE.Color
  | THREE.Node
  | TextureValue
  | NodeRecord;

/** A record of named outputs (SEPXYZ, TEX_IMAGE, tex-coord, …). */
interface NodeRecord {
  [key: string]: NodeValue;
}

/** A texture to be sampled with a UV — resolved lazily on coercion. */
interface TextureValue {
  __texture: THREE.Texture;
  /** Optional custom UV (from a connected tex-coord / mapping node). */
  __uv?: THREE.Node;
}

function isTextureValue(v: unknown): v is TextureValue {
  return (
    !!v &&
    typeof v === "object" &&
    (v as any).__texture instanceof THREE.Texture
  );
}

function isNodeRecord(v: unknown): v is Record<string, NodeValue> {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof THREE.Color) &&
    !(v instanceof THREE.Node) &&
    !isTextureValue(v)
  );
}

function sampleTexture(tv: TextureValue): THREE.Node {
  return tslTexture(tv.__texture, tv.__uv ?? tslUV());
}

/** Coerce any node value into a TSL node. */
function toNode(v: NodeValue | null | undefined): any {
  if (v == null) return float(0);
  if (typeof v === "number") return float(v);
  if (Array.isArray(v)) return vec3(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  if (v instanceof THREE.Color) return color(v.r, v.g, v.b);
  if (v instanceof THREE.Node) return v;
  if (isTextureValue(v)) return sampleTexture(v);
  return float(0);
}

/** Coerce into a vec3 node (textures sample .rgb). */
function toVec3(v: NodeValue | null | undefined): any {
  if (v == null) return vec3(0, 0, 0);
  if (typeof v === "number") return vec3(v, v, v);
  if (Array.isArray(v)) return vec3(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  if (v instanceof THREE.Color) return color(v.r, v.g, v.b);
  if (v instanceof THREE.Node) return v;
  if (isTextureValue(v)) return (sampleTexture(v) as any).rgb;
  return vec3(0, 0, 0);
}

/** Coerce into a float node (textures sample .r). */
function toFloat(v: NodeValue | null | undefined): any {
  if (v == null) return float(0);
  if (typeof v === "number") return float(v);
  if (Array.isArray(v)) return float(v[0] ?? 0);
  if (v instanceof THREE.Color) return float(v.r);
  if (v instanceof THREE.Node) return v;
  if (isTextureValue(v)) return (sampleTexture(v) as any).r;
  return float(0);
}

/**
 * Resolve a texture node's `Vector` input into a UV node, or `undefined` to
 * fall back to the default UVs. Critical: an *unconnected* Vector socket
 * serialises its default value as `[0, 0, 0]` — that must NOT become a
 * constant UV (which would sample a single texel). Only actual connections
 * (tex-coord / mapping / a live TSL node) drive a custom UV.
 */
function resolveVectorUV(vec: NodeValue | null | undefined): any | undefined {
  if (isNodeRecord(vec)) {
    const inner = (vec as Record<string, NodeValue>).uv;
    return inner ? toVec3(inner) : undefined;
  }
  if (vec instanceof THREE.Node || isTextureValue(vec)) {
    return toVec3(vec);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Color Ramp — canvas-based gradient texture
// ---------------------------------------------------------------------------

const _rampTextureCache = new Map<string, THREE.CanvasTexture>();

type RGBA = [number, number, number, number];

function stopRGBA(stops: ColorStop[], idx: number): RGBA {
  const s = stops[Math.max(0, Math.min(stops.length - 1, idx))];
  return [
    s.color[0],
    s.color[1],
    s.color[2],
    s.color.length >= 4 ? s.color[3] : 1.0,
  ];
}

function lerpRGBA(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

function bSplineRGBA(p0: RGBA, p1: RGBA, p2: RGBA, p3: RGBA, t: number): RGBA {
  const t2 = t * t;
  const t3 = t2 * t;
  const w0 = ((1 - t) * (1 - t) * (1 - t)) / 6;
  const w1 = (3 * t3 - 6 * t2 + 4) / 6;
  const w2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
  const w3 = t3 / 6;
  return [
    p0[0] * w0 + p1[0] * w1 + p2[0] * w2 + p3[0] * w3,
    p0[1] * w0 + p1[1] * w1 + p2[1] * w2 + p3[1] * w3,
    p0[2] * w0 + p1[2] * w1 + p2[2] * w2 + p3[2] * w3,
    p0[3] * w0 + p1[3] * w1 + p2[3] * w2 + p3[3] * w3,
  ];
}

function cardinalRGBA(p0: RGBA, p1: RGBA, p2: RGBA, p3: RGBA, t: number): RGBA {
  const t2 = t * t;
  const t3 = t2 * t;
  const w0 = -0.5 * t + t2 - 0.5 * t3;
  const w1 = 1 - 2.5 * t2 + 1.5 * t3;
  const w2 = 0.5 * t + 2 * t2 - 1.5 * t3;
  const w3 = -0.5 * t2 + 0.5 * t3;
  return [
    p0[0] * w0 + p1[0] * w1 + p2[0] * w2 + p3[0] * w3,
    p0[1] * w0 + p1[1] * w1 + p2[1] * w2 + p3[1] * w3,
    p0[2] * w0 + p1[2] * w1 + p2[2] * w2 + p3[2] * w3,
    p0[3] * w0 + p1[3] * w1 + p2[3] * w2 + p3[3] * w3,
  ];
}

function evaluateColorRampRGBA(
  factor: number,
  stops: ColorStop[],
  interpolation: string,
): RGBA {
  if (stops.length === 0) return [0, 0, 0, 1];
  if (stops.length === 1) return stopRGBA(stops, 0);

  const first = stops[0].position;
  const last = stops[stops.length - 1].position;
  const t = Math.max(first, Math.min(last, factor));

  let i = stops.length - 2;
  for (let k = 0; k < stops.length - 1; k++) {
    if (t <= stops[k + 1].position) {
      i = k;
      break;
    }
  }

  const p0 = stops[i].position;
  const p1 = stops[i + 1].position;
  const range = p1 - p0;
  const segT = range < 1e-6 ? 0 : (t - p0) / range;

  const a = stopRGBA(stops, i);
  const b = stopRGBA(stops, i + 1);

  let out: RGBA;
  switch (interpolation) {
    case "CONSTANT":
      out = segT < 0.5 ? a : b;
      break;
    case "EASE": {
      const fc = Math.pow(segT, 0.1);
      const e = 3 * fc * fc - 2 * fc * fc * fc;
      out = lerpRGBA(a, b, e);
      break;
    }
    case "B_SPLINE":
      out = bSplineRGBA(
        stopRGBA(stops, i - 1),
        a,
        b,
        stopRGBA(stops, i + 2),
        segT,
      );
      break;
    case "CARDINAL":
      out = cardinalRGBA(
        stopRGBA(stops, i - 1),
        a,
        b,
        stopRGBA(stops, i + 2),
        segT,
      );
      break;
    case "LINEAR":
    default:
      out = lerpRGBA(a, b, segT);
  }

  return [
    Math.max(0, Math.min(1, out[0])),
    Math.max(0, Math.min(1, out[1])),
    Math.max(0, Math.min(1, out[2])),
    Math.max(0, Math.min(1, out[3])),
  ];
}

function generateColorRampTexture(
  stops: ColorStop[],
  interpolation: string,
): THREE.CanvasTexture {
  const hashKey = JSON.stringify({ stops, interpolation });
  const cached = _rampTextureCache.get(hashKey);
  if (cached) return cached;

  const width = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, 1);

  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const [r, g, b, a] = evaluateColorRampRGBA(t, stops, interpolation);
    const px = x * 4;
    img.data[px] = Math.round(Math.max(0, Math.min(1, r)) * 255);
    img.data[px + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
    img.data[px + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
    img.data[px + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  _rampTextureCache.set(hashKey, tex);
  return tex;
}

function evaluateColorRampAt(
  factor: number,
  stops: ColorStop[],
  interpolation: string,
): [number, number, number] {
  const [r, g, b] = evaluateColorRampRGBA(factor, stops, interpolation);
  return [r, g, b];
}

interface RampTextureMarker {
  __rampTexture: true;
  texture: THREE.CanvasTexture;
  constantColor?: [number, number, number];
}

// ---------------------------------------------------------------------------
// Curve mapping (CURVE_RGB / CURVE_VEC / CURVE_FLOAT)
// ---------------------------------------------------------------------------

const _curveTextureCache = new Map<string, THREE.CanvasTexture>();

function generateCurveTexture(data: CurveData): THREE.CanvasTexture {
  const hashKey = JSON.stringify(data);
  const cached = _curveTextureCache.get(hashKey);
  if (cached) return cached;

  const width = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 4;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, 4);

  const x0 = data.xmin ?? 0;
  const x1 = data.xmax ?? 1;
  const y0 = data.ymin ?? 0;
  const y1 = data.ymax ?? 1;

  const sampleCurve = (pts: [number, number][], t: number): number => {
    if (!pts || pts.length === 0) return t;
    if (pts.length === 1) return pts[0][1];
    const tx = x0 + (x1 - x0) * t;
    let lo = pts[0];
    let hi = pts[pts.length - 1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (tx >= pts[i][0] && tx <= pts[i + 1][0]) {
        lo = pts[i];
        hi = pts[i + 1];
        break;
      }
    }
    const span = hi[0] - lo[0];
    if (Math.abs(span) < 1e-6) return lo[1];
    const f = (tx - lo[0]) / span;
    const v = lo[1] + (hi[1] - lo[1]) * f;
    if (data.extend !== "EXTRAPOLATED") return Math.min(y1, Math.max(y0, v));
    return v;
  };

  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    for (let c = 0; c < 4; c++) {
      const curve = data.curves[Math.min(c, data.curves.length - 1)];
      const v = sampleCurve(curve ?? [], t);
      const n = ((v - y0) / (y1 - y0 || 1)) * 255;
      img.data[(c * width + x) * 4 + 0] = n;
      img.data[(c * width + x) * 4 + 1] = n;
      img.data[(c * width + x) * 4 + 2] = n;
      img.data[(c * width + x) * 4 + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  _curveTextureCache.set(hashKey, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Node registry — each Blender node type maps to a TSL expression builder
// ---------------------------------------------------------------------------

interface NodeCtx {
  node: BlenderNode;
  getInput: (name: string) => NodeValue | null | undefined;
  getProps: <T>(name: string, fallback: T) => T;
  resolveImage: (
    name: string,
    kind: "color" | "noncolor",
  ) => THREE.Texture | null;
}

function fresnelNode(power: any): any {
  const n = normalView as any;
  const v = normalize(positionViewDirection as any);
  const d = clamp(dot(n, v) as any, float(0), float(1));
  return pow(oneMinus(d) as any, power);
}

// --- Math operations (Blender MATH node) ----------------------------------

function lessThan(a: THREE.Node, b: THREE.Node): any {
  return (a as any).lessThan(b);
}
function greaterThan(a: THREE.Node, b: THREE.Node): any {
  return (a as any).greaterThan(b);
}
function tan(a: THREE.Node): any {
  return (a as any).tan();
}
function asin(a: THREE.Node): any {
  return (a as any).asin();
}
function acos(a: THREE.Node): any {
  return (a as any).acos();
}
function atan(a: THREE.Node): any {
  return (a as any).atan();
}
function atan2(a: THREE.Node, b: THREE.Node): any {
  return (a as any).atan2(b);
}
function sinh(a: THREE.Node): any {
  return (a as any).sinh();
}
function cosh(a: THREE.Node): any {
  return (a as any).cosh();
}
function tanh(a: THREE.Node): any {
  return (a as any).tanh();
}

const MATH_OPS: Record<string, (a: any, b: any, c: any) => any> = {
  ADD: (a, b) => add(a, b),
  SUBTRACT: (a, b) => sub(a, b),
  MULTIPLY: (a, b) => mul(a, b),
  DIVIDE: (a, b) => div(a, b),
  MULTIPLY_ADD: (a, b, c) => add(mul(a, b), c),
  POWER: (a, b) => pow(a, b),
  LOGARITHM: (a, b) => div(log(a), log(b)),
  SQRT: (a) => sqrt(a),
  INVERSE_SQRT: (a) => div(float(1), sqrt(a)),
  ABSOLUTE: (a) => abs(a),
  EXPONENT: (a) => exp(a),
  MINIMUM: (a, b) => min(a, b),
  MAXIMUM: (a, b) => max(a, b),
  LESS_THAN: (a, b) => select(lessThan(a, b), float(1), float(0)) as any,
  GREATER_THAN: (a, b) => select(greaterThan(a, b), float(1), float(0)) as any,
  SIGN: (a) => sign(a),
  ROUND: (a) => round(a),
  FLOOR: (a) => floor(a),
  CEIL: (a) => ceil(a),
  TRUNC: (a) => trunc(a),
  FRACT: (a) => fract(a),
  MODULO: (a, b) => mod(a, b),
  FLOORED_MODULO: (a, b) => sub(a, mul(b, floor(div(a, b)))),
  WRAP: (a, b) => sub(a, mul(b, floor(div(a, b)))),
  SNAP: (a, b) => mul(floor(div(a, b)), b),
  PINGPONG: (a, b) => sub(b, abs(sub(mod(a, mul(b, float(2))), b))),
  SINE: (a) => sin(a),
  COSINE: (a) => cos(a),
  TANGENT: (a) => tan(a),
  ARCSINE: (a) => asin(a),
  ARCCOSINE: (a) => acos(a),
  ARCTANGENT: (a) => atan(a),
  ARCTAN2: (a, b) => atan2(a, b),
  SINH: (a) => sinh(a),
  COSH: (a) => cosh(a),
  TANH: (a) => tanh(a),
  COMPARE: (a, b) =>
    select(lessThan(abs(sub(a, b)) as any, float(0.001)), float(1), float(0)),
  SMOOTH_MIN: (a, b) => min(a, b),
  SMOOTH_MAX: (a, b) => max(a, b),
};

// --- Vector math operations (Blender VECTOR_MATH node) ---------------------

const VEC_MATH_OPS: Record<string, (a: any, b: any, c: any) => any> = {
  ADD: (a, b) => add(a, b),
  SUBTRACT: (a, b) => sub(a, b),
  MULTIPLY: (a, b) => mul(a, b),
  DIVIDE: (a, b) => div(a, b),
  MULTIPLY_ADD: (a, b, c) => add(mul(a, b), c),
  CROSS: (a, b) => cross(a, b),
  PROJECT: (a, b) => div(mul(b, dot(a, b)), dot(b, b)),
  REFLECT: (a, b) => reflect(a, b),
  REFRACT: (a, b, c) => refract(a, b, c),
  DOT: (a, b) => dot(a, b) as any,
  DISTANCE: (a, b) => distance(a, b) as any,
  LENGTH: (a) => length(a) as any,
  SCALE: (a, b) => mul(a, b),
  NORMALIZE: (a) => normalize(a),
  ABSOLUTE: (a) => abs(a),
  MINIMUM: (a, b) => min(a, b),
  MAXIMUM: (a, b) => max(a, b),
  FLOOR: (a) => floor(a),
  CEIL: (a) => ceil(a),
  FRACT: (a) => fract(a),
  MODULO: (a, b) => mod(a, b),
  WRAP: (a, b) => sub(a, mul(b, floor(div(a, b)))),
  SNAP: (a, b) => mul(floor(div(a, b)), b),
  SINE: (a) => sin(a),
  COSINE: (a) => cos(a),
  TANGENT: (a) => tan(a),
  ARCSINE: (a) => asin(a),
  ARCCOSINE: (a) => acos(a),
  ARCTANGENT: (a) => atan(a),
  ARCTAN2: (a, b) => atan2(a, b),
  SINH: (a) => sinh(a),
  COSH: (a) => cosh(a),
  TANH: (a) => tanh(a),
};

// --- Mix RGB blend modes (Blender MIX_RGB / MIX nodes) ----------------------

function blendFactor(a: any, _b: any, fac: any, out: any): any {
  return mix(a, out, fac);
}

const BLEND_MODES: Record<string, (a: any, b: any, fac: any) => any> = {
  MIX: (a, b, fac) => mix(a, b, fac),
  DARKEN: (a, b, fac) => blendFactor(a, b, fac, min(a, b)),
  MULTIPLY: (a, b, fac) => blendFactor(a, b, fac, mul(a, b)),
  BURN: (a, b, fac) => blendFactor(a, b, fac, blendBurn(a, b)),
  LIGHTEN: (a, b, fac) => blendFactor(a, b, fac, max(a, b)),
  SCREEN: (a, b, fac) => blendFactor(a, b, fac, blendScreen(a, b)),
  DODGE: (a, b, fac) => blendFactor(a, b, fac, blendDodge(a, b)),
  ADD: (a, b, fac) =>
    blendFactor(a, b, fac, clamp(add(a, b), float(0), float(1))),
  OVERLAY: (a, b, fac) => blendFactor(a, b, fac, blendOverlay(a, b)),
  SOFT_LIGHT: (a, b, fac) =>
    blendFactor(
      a,
      b,
      fac,
      mix(
        mul(a, b),
        sub(add(mul(float(2), a), b), float(1)),
        step(float(0.5), a),
      ),
    ),
  LINEAR_LIGHT: (a, b, fac) =>
    blendFactor(
      a,
      b,
      fac,
      clamp(add(a, sub(mul(float(2), b), float(1))), float(0), float(1)),
    ),
  DIFFERENCE: (a, b, fac) => blendFactor(a, b, fac, abs(sub(a, b))),
  SUBTRACT: (a, b, fac) =>
    blendFactor(a, b, fac, clamp(sub(a, b), float(0), float(1))),
  DIVIDE: (a, b, fac) =>
    blendFactor(a, b, fac, clamp(div(a, b), float(0), float(1))),
  HUE: (a, b, fac) => blendFactor(a, b, fac, b),
  SATURATION: (a, b, fac) => blendFactor(a, b, fac, b),
  COLOR: (a, b, fac) => blendFactor(a, b, fac, b),
  VALUE: (a, b, fac) => blendFactor(a, b, fac, b),
};

// --- Float blend modes (unified Mix node with data_type=FLOAT) -------------

const FLOAT_BLEND_OPS: Record<string, (a: any, b: any, fac: any) => any> = {
  MIX: (a, b, fac) => mix(a, b, fac),
  ADD: (a, b, fac) => mix(a, add(a, b), fac),
  MULTIPLY: (a, b, fac) => mix(a, mul(a, b), fac),
  SUBTRACT: (a, b, fac) => mix(a, sub(a, b), fac),
  DIVIDE: (a, b, fac) => mix(a, div(a, b), fac),
  DARKEN: (a, b, fac) => mix(a, min(a, b), fac),
  LIGHTEN: (a, b, fac) => mix(a, max(a, b), fac),
  DIFFERENCE: (a, b, fac) => mix(a, abs(sub(a, b)), fac),
  SCREEN: (a, b, fac) => mix(a, blendScreen(a, b), fac),
};

// ---------------------------------------------------------------------------
// Recursive shader graph evaluator
// ---------------------------------------------------------------------------

const NODE_BUILDERS: Record<string, (ctx: NodeCtx) => any> = {
  // ---- Terminal ----------------------------------------------------------
  "output-material": (ctx) => ctx.getInput("surface") ?? 0,

  // ---- BSDF / shader nodes ------------------------------------------------
  "bsdf-principled": (ctx) => {
    const first = (...names: string[]) => {
      for (const n of names) {
        const v = ctx.getInput(n);
        if (v != null) return v;
      }
      return null;
    };
    return {
      __bsdf: "principled",
      baseColor: first("base-color", "base_color"),
      roughness: first("roughness"),
      metallic: first("metallic"),
      emissiveColor: first("emission-color", "emission_color"),
      emissiveStrength: first("emission-strength", "emission_strength"),
      alpha: first("alpha"),
      normal: first("normal"),
      transmission: first("transmission", "transmission-weight"),
      transmissionRoughness: first(
        "transmission-roughness",
        "transmission_roughness",
      ),
      thickness: first("thickness", "transmission-thickness"),
      ior: first("ior"),
      clearcoat: first("clearcoat", "coat", "coat-weight"),
      clearcoatRoughness: first("clearcoat-roughness", "coat-roughness"),
      clearcoatNormal: first("clearcoat-normal", "coat-normal"),
      sheen: first("sheen", "sheen-weight"),
      sheenRoughness: first("sheen-roughness"),
      sheenTint: first("sheen-tint"),
      specular: first("specular", "specular-ior-level"),
      specularTint: first("specular-tint"),
      anisotropic: first("anisotropic"),
      anisotropicRotation: first("anisotropic-rotation"),
      iridescence: first("iridescence", "thin-film", "thin-film-weight"),
      iridescenceThickness: first(
        "iridescence-thickness",
        "thin-film-thickness",
      ),
      iridescenceIOR: first("iridescence-ior", "thin-film-ior"),
      dispersion: first("dispersion"),
      attenuationDistance: first("attenuation-distance"),
      attenuationColor: first("attenuation-color"),
    };
  },

  "bsdf-diffuse": (ctx) => ({
    __bsdf: "diffuse",
    baseColor: ctx.getInput("color") ?? ctx.getInput("base-color") ?? null,
    roughness: ctx.getInput("roughness") ?? null,
    alpha: ctx.getInput("alpha") ?? null,
    normal: ctx.getInput("normal") ?? null,
  }),

  "bsdf-glossy": (ctx) => ({
    __bsdf: "glossy",
    baseColor: ctx.getInput("color") ?? null,
    roughness: ctx.getInput("roughness") ?? null,
    metallic: float(1),
    normal: ctx.getInput("normal") ?? null,
  }),

  "bsdf-transparent": (ctx) => ({
    __bsdf: "transparent",
    baseColor: ctx.getInput("color") ?? null,
    alpha: float(0),
  }),

  "bsdf-translucent": (ctx) => ({
    __bsdf: "translucent",
    baseColor: ctx.getInput("color") ?? null,
    normal: ctx.getInput("normal") ?? null,
    transmission: float(1),
  }),

  "bsdf-specular": (ctx) => ({
    __bsdf: "specular",
    baseColor: ctx.getInput("base-color") ?? ctx.getInput("color") ?? null,
    specular: ctx.getInput("specular") ?? null,
    roughness: ctx.getInput("roughness") ?? null,
    normal: ctx.getInput("normal") ?? null,
  }),

  "bsdf-sheen": (ctx) => ({
    __bsdf: "sheen",
    baseColor: ctx.getInput("color") ?? null,
    sheen: float(1),
    sheenRoughness: ctx.getInput("roughness") ?? null,
    normal: ctx.getInput("normal") ?? null,
  }),

  "bsdf-toon": (ctx) => ({
    __bsdf: "toon",
    baseColor: ctx.getInput("color") ?? null,
    normal: ctx.getInput("normal") ?? null,
  }),

  "bsdf-hair": (ctx) => ({
    __bsdf: "hair",
    baseColor: ctx.getInput("color") ?? null,
    roughness: ctx.getInput("roughness") ?? null,
  }),

  "bsdf-velvet": (ctx) => ({
    __bsdf: "velvet",
    baseColor: ctx.getInput("color") ?? null,
    normal: ctx.getInput("normal") ?? null,
  }),

  "bsdf-glass": (ctx) => ({
    __bsdf: "glass",
    baseColor: ctx.getInput("color") ?? null,
    roughness: ctx.getInput("roughness") ?? null,
    ior: ctx.getInput("ior") ?? null,
    normal: ctx.getInput("normal") ?? null,
    transmission: float(1),
  }),

  emission: (ctx) => ({
    __bsdf: "emission",
    emissiveColor: ctx.getInput("color") ?? null,
    emissiveStrength: ctx.getInput("strength") ?? null,
  }),

  "mix-shader": (ctx) => {
    const a = ctx.getInput("shader") ?? null;
    const b = ctx.getInput("shader-001") ?? null;
    return {
      __bsdf: "mix",
      mixFac: ctx.getInput("fac") ?? float(0.5),
      shaderA: a as any,
      shaderB: b as any,
    };
  },

  "add-shader": (ctx) => {
    const a = ctx.getInput("shader") ?? null;
    const b = ctx.getInput("shader-001") ?? null;
    return { __bsdf: "add", shaderA: a as any, shaderB: b as any };
  },

  holdout: () => ({ __bsdf: "holdout", baseColor: float(0), alpha: float(0) }),

  "subsurface-scattering": (ctx) => ({
    __bsdf: "subsurface",
    baseColor: ctx.getInput("color") ?? ctx.getInput("base-color") ?? null,
    normal: ctx.getInput("normal") ?? null,
    transmission: float(1),
  }),

  // ---- Texture coordinate / attribute inputs ------------------------------

  "tex-coord": () => ({
    generated: positionLocal as unknown as NodeValue,
    normal: normalLocal as unknown as NodeValue,
    uv: tslUV() as unknown as NodeValue,
    object: positionLocal as unknown as NodeValue,
    camera: positionViewDirection as unknown as NodeValue,
    window: screenUV as unknown as NodeValue,
    reflection: reflectView as unknown as NodeValue,
  }),

  uvmap: (ctx) => {
    const idx = ctx.getProps<number>("uv", 0);
    return { uv: tslUV(idx) as unknown as NodeValue };
  },

  attribute: (ctx) => {
    const name = ctx.getProps<string>("attribute_name", "");
    switch (name) {
      case "position":
      case "Position":
        return positionLocal as unknown as NodeValue;
      case "normal":
      case "Normal":
        return normalLocal as unknown as NodeValue;
      case "uv":
      case "UV":
        return tslUV() as unknown as NodeValue;
      default:
        return attribute(name, "vec3") as unknown as NodeValue;
    }
  },

  rgb: (ctx) => {
    const out = ctx.node.outputs?.find((o) => o.name === "color")?.value;
    if (Array.isArray(out)) return out as number[];
    return [0.5, 0.5, 0.5];
  },

  value: (ctx) => {
    const out = ctx.node.outputs?.find((o) => o.name === "value")?.value;
    return typeof out === "number" ? out : 0;
  },

  integer: (ctx) => {
    const out = ctx.node.outputs?.find((o) => o.name === "integer")?.value;
    return typeof out === "number" ? int(out) : int(0);
  },

  boolean: (ctx) => {
    const out = ctx.node.outputs?.find((o) => o.name === "boolean")?.value;
    return bool(!!out);
  },

  vector: (ctx) => {
    const out = ctx.node.outputs?.find((o) => o.name === "vector")?.value;
    if (Array.isArray(out)) return vec3(out[0] ?? 0, out[1] ?? 0, out[2] ?? 0);
    return vec3(0, 0, 0);
  },

  reroute: (ctx) => ctx.getInput("input") ?? 0,

  fresnel: (ctx) => {
    const ior = toFloat(ctx.getInput("ior") ?? 1.45);
    const power = (ior as any) > 1.0 ? float(5) : float(3);
    return fresnelNode(power) as unknown as NodeValue;
  },

  "layer-weight": (ctx) => {
    const blend = toFloat(ctx.getInput("blend") ?? 0.5);
    const f = fresnelNode(mul(blend, float(5))) as any;
    return { fac: f, f: f } as unknown as NodeValue;
  },

  "object-info": () => ({
    location: (objectPosition as any)() as unknown as NodeValue,
    color: float(0) as unknown as NodeValue,
    alpha: float(0) as unknown as NodeValue,
    index: float(0) as unknown as NodeValue,
    random: hash(positionLocal as any) as unknown as NodeValue,
  }),

  tangent: () => tangentWorld as unknown as NodeValue,

  geometry: () => ({
    position: positionWorld as unknown as NodeValue,
    normal: normalWorld as unknown as NodeValue,
    tangent: tangentWorld as unknown as NodeValue,
    "true-normal": normalWorld as unknown as NodeValue,
    incoming: positionViewDirection as unknown as NodeValue,
    parametric: tslUV() as unknown as NodeValue,
    backfacing: faceDirection as unknown as NodeValue,
    random: hash(positionLocal as any) as unknown as NodeValue,
  }),

  "vertex-color": () => ({
    color: vertexColor() as unknown as NodeValue,
    alpha: float(1),
  }),

  wireframe: () => ({ fac: float(1) }),

  // ---- Texture nodes --------------------------------------------------------

  "tex-image": (ctx) => {
    const name = ctx.getInput("image");
    const imgName = typeof name === "string" ? name : undefined;
    const kind: "color" | "noncolor" =
      ctx.node.colorspace === "Non-Color" ? "noncolor" : "color";
    const tex = imgName ? ctx.resolveImage(imgName, kind) : null;
    if (!tex) return { color: [0, 0, 0], alpha: float(1) };

    const uvNode = resolveVectorUV(ctx.getInput("vector"));
    return {
      color: { __texture: tex, __uv: uvNode } as TextureValue,
      alpha: { __texture: tex, __uv: uvNode } as TextureValue,
    };
  },

  "tex-environment": (ctx) => {
    const name = ctx.getInput("image");
    const imgName = typeof name === "string" ? name : undefined;
    const tex = imgName ? ctx.resolveImage(imgName, "color") : null;
    if (!tex) return { color: [0, 0, 0] };
    const uvNode = resolveVectorUV(ctx.getInput("vector"));
    return { color: { __texture: tex, __uv: uvNode } as TextureValue };
  },

  "tex-noise": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const detail = toFloat(ctx.getInput("detail") ?? 2);
    const roughness = toFloat(ctx.getInput("roughness") ?? 0.5);
    const distortion = toFloat(ctx.getInput("distortion") ?? 0);
    const vector = ctx.getInput("vector");
    const pos = resolveVectorUV(vector) ?? tslUV();
    const scaled = mul(pos, scale) as any;
    const noiseType = ctx.getProps<string>("noise_type", "FBM");
    let fac: any;
    if (noiseType === "PERLIN") {
      fac = mx_noise_float(scaled) as any;
    } else {
      fac = mx_fractal_noise_float(scaled, detail, float(2), roughness) as any;
    }
    if ((distortion as any).isNode === true) {
      const off = mul(mx_noise_float(mul(pos, scale)) as any, distortion);
      fac = mx_noise_float(add(scaled, off) as any) as any;
    }
    return { fac, color: vec3(fac, fac, fac) as any };
  },

  "tex-voronoi": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const vector = ctx.getInput("vector");
    const pos = resolveVectorUV(vector) ?? tslUV();
    const scaled = mul(pos, scale) as any;
    const fac = mx_worley_noise_float(scaled) as any;
    return { distance: fac, color: vec3(fac, fac, fac) as any, position: pos };
  },

  "tex-white-noise": (ctx) => {
    const vector = ctx.getInput("vector");
    const pos = resolveVectorUV(vector) ?? tslUV();
    const dim = ctx.getProps<string>("noise_dimensions", "3D");
    let f: any;
    if (dim === "1D") f = rand((pos as any).x) as any;
    else if (dim === "2D")
      f = rand(vec2((pos as any).x, (pos as any).y)) as any;
    else f = rand(pos) as any;
    return { fac: f, color: vec3(f, f, f) as any };
  },

  "tex-checker": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const c1 = toVec3(ctx.getInput("color1") ?? [0.8, 0.8, 0.8]);
    const c2 = toVec3(ctx.getInput("color2") ?? [0.2, 0.2, 0.2]);
    const vector = ctx.getInput("vector");
    const pos = resolveVectorUV(vector) ?? tslUV();
    const cell = checker(mul(pos, scale) as any) as any;
    const col = mix(c2, c1, cell);
    return { color: col, fac: cell };
  },

  "tex-gradient": (ctx) => {
    const vector = ctx.getInput("vector");
    const pos = resolveVectorUV(vector) ?? tslUV();
    const u = (pos as any).x as any;
    const v = (pos as any).y as any;
    const typ = ctx.getProps<string>("gradient_type", "LINEAR");
    let f: any;
    switch (typ) {
      case "RADIAL":
        f = length(vec2(u, v) as any);
        break;
      case "DIAGONAL":
        f = clamp(add(u, v), float(0), float(1));
        break;
      case "SPHERICAL":
        f = clamp(length(vec2(u, v) as any), float(0), float(1));
        break;
      case "QUADRATIC":
        f = clamp(mul(u, u), float(0), float(1));
        break;
      case "EASING":
        f = smoothstep(float(0), float(1), u);
        break;
      default:
        f = clamp(u, float(0), float(1));
    }
    return { color: vec3(f, f, f) as any, fac: f };
  },

  "tex-musgrave": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const detail = toFloat(ctx.getInput("detail") ?? 2);
    const roughness = toFloat(ctx.getInput("roughness") ?? 0.5);
    const vector = ctx.getInput("vector");
    const pos = resolveVectorUV(vector) ?? tslUV();
    const scaled = mul(pos, scale) as any;
    const fac = mx_fractal_noise_float(
      scaled,
      detail,
      float(2),
      roughness,
    ) as any;
    return { fac, color: vec3(fac, fac, fac) as any };
  },

  "tex-wave": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const vector = ctx.getInput("vector");
    const pos = resolveVectorUV(vector) ?? tslUV();
    const p = mul(pos, scale) as any;
    const typ = ctx.getProps<string>("wave_type", "BANDS");
    const profile = ctx.getProps<string>("wave_profile", "SINE");
    let phase: any;
    if (typ === "RINGS") {
      phase = length(p as any) as any;
    } else {
      phase = (p as any).x as any;
    }
    let f: any;
    switch (profile) {
      case "SQUARE":
        f = step(float(0), sin(phase)) as any;
        break;
      case "TRIANGLE":
        f = asin(oscTriangle(phase) as any) as any;
        break;
      case "SAW":
        f = add(float(0.5), mul(float(0.5), oscSawtooth(phase) as any));
        break;
      default:
        f = add(float(0.5), mul(float(0.5), oscSine(phase) as any));
    }
    return { fac: f, color: vec3(f, f, f) as any };
  },

  "tex-magic": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const vector = ctx.getInput("vector");
    const pos = resolveVectorUV(vector) ?? tslUV();
    const fac = triNoise3D(mul(pos, scale) as any, float(0), float(1)) as any;
    return { color: vec3(fac, fac, fac) as any, fac };
  },

  "tex-brick": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const c1 = toVec3(ctx.getInput("color1") ?? [0.8, 0.2, 0.2]);
    const c2 = toVec3(ctx.getInput("color2") ?? [0.4, 0.4, 0.4]);
    const vector = ctx.getInput("vector");
    const pos = resolveVectorUV(vector) ?? tslUV();
    const p = mul(pos, scale) as any;
    const x = fract((p as any).x as any) as any;
    const y = fract((p as any).y as any) as any;
    const brick = select(
      lessThan(y, float(0.5)),
      step(float(0.5), x),
      step(float(0.25), x),
    ) as any;
    return { color: mix(c2, c1, brick), fac: brick };
  },

  "tex-mask": (ctx) => {
    const c1 = toVec3(ctx.getInput("color1") ?? [1, 1, 1]);
    const c2 = toVec3(ctx.getInput("color2") ?? [0, 0, 0]);
    const col = mix(c2, c1, float(0.5));
    return { color: col, fac: float(0.5) };
  },

  // ---- Color nodes ----------------------------------------------------------

  mix: (ctx) => {
    const dataType = ctx.getProps<string>("data_type", "COLOR");
    const blend = ctx.getProps<string>("blend_type", "MIX");
    const a = ctx.getInput("a");
    const b = ctx.getInput("b");
    const factor =
      ctx.getInput("factor") ?? ctx.getInput("factor-float") ?? 0.5;

    if (dataType === "FLOAT") {
      const fa = toFloat(a ?? 0);
      const fb = toFloat(b ?? 0);
      const f = toFloat(factor);
      const op = FLOAT_BLEND_OPS[blend] ?? FLOAT_BLEND_OPS.MIX!;
      return op(fa, fb, f);
    }

    const va = toVec3(a ?? [0, 0, 0]);
    const vb = toVec3(b ?? [1, 1, 1]);
    const f = toFloat(factor);
    const op = BLEND_MODES[blend] ?? BLEND_MODES.MIX!;
    return op(va, vb, f);
  },

  "mix-rgb": (ctx) => {
    const fac = toFloat(ctx.getInput("fac") ?? 0.5);
    const a = toVec3(ctx.getInput("color1") ?? [0, 0, 0]);
    const b = toVec3(ctx.getInput("color2") ?? [1, 1, 1]);
    const blend = ctx.getProps<string>("blend_type", "MIX");
    const f = BLEND_MODES[blend] ?? BLEND_MODES.MIX!;
    return f(a, b, fac) as unknown as NodeValue;
  },

  invert: (ctx) => {
    const fac = toFloat(ctx.getInput("fac") ?? 1);
    const c = toVec3(ctx.getInput("color") ?? [0.5, 0.5, 0.5]);
    return mix(c, oneMinus(c) as any, fac) as unknown as NodeValue;
  },

  "hue-sat": (ctx) => {
    const fac = toFloat(ctx.getInput("fac") ?? 1);
    const hue = toFloat(ctx.getInput("hue") ?? 0.5);
    const sat = toFloat(ctx.getInput("saturation") ?? 1);
    const val = toFloat(ctx.getInput("value") ?? 1);
    const c = toVec3(ctx.getInput("color") ?? [0.5, 0.5, 0.5]);
    const adjusted = mul(
      saturation(hue(c, hue) as any, sat) as any,
      val,
    ) as any;
    return mix(c, adjusted, fac) as unknown as NodeValue;
  },

  "rgb-to-bw": (ctx) => {
    const c = toVec3(ctx.getInput("color") ?? [0.5, 0.5, 0.5]);
    const lum = luminance(c) as any;
    return vec3(lum, lum, lum) as unknown as NodeValue;
  },

  gamma: (ctx) => {
    const c = toVec3(ctx.getInput("color") ?? [0.5, 0.5, 0.5]);
    const g = toFloat(ctx.getInput("gamma") ?? 1);
    return pow(c, vec3(div(float(1), g)) as any) as unknown as NodeValue;
  },

  "bright-contra": (ctx) => {
    const c = toVec3(ctx.getInput("color") ?? [0.5, 0.5, 0.5]);
    const bright = toFloat(ctx.getInput("bright") ?? 0);
    const contrast = toFloat(ctx.getInput("contrast") ?? 0);
    return add(
      mul(sub(c, vec3(0.5, 0.5, 0.5)), contrast),
      add(c, vec3(bright, bright, bright)),
    ) as unknown as NodeValue;
  },

  valtorgb: (ctx) => {
    const fac = ctx.getInput("fac");
    const rampData = ctx.node.colorRamp;
    if (!rampData || !rampData.stops || rampData.stops.length < 2) {
      const fv = typeof fac === "number" ? fac : 0.5;
      return [fv, fv, fv] as number[];
    }
    const tex = generateColorRampTexture(
      rampData.stops,
      rampData.interpolation,
    );

    if (typeof fac === "number") {
      return {
        __rampTexture: true,
        texture: tex,
        constantColor: evaluateColorRampAt(
          fac,
          rampData.stops,
          rampData.interpolation,
        ),
      } satisfies RampTextureMarker;
    }
    const fNode = toFloat(fac);
    return tslTexture(
      tex,
      vec2(fNode, float(0)) as any,
    ) as unknown as NodeValue;
  },

  "curve-rgb": (ctx) => {
    const fac = ctx.getInput("fac") ?? ctx.getInput("value") ?? 0.5;
    const c = ctx.getInput("color");
    const cd = ctx.node.curveData;
    if (!cd) return toVec3(c ?? fac ?? [0.5, 0.5, 0.5]);
    const tex = generateCurveTexture(cd);
    const fNode = toFloat(fac);
    return tslTexture(
      tex,
      vec2(fNode, float(0)) as any,
    ) as unknown as NodeValue;
  },

  "curve-vec": (ctx) => {
    const fac = ctx.getInput("fac") ?? ctx.getInput("value") ?? 0.5;
    const cd = ctx.node.curveData;
    if (!cd) return toVec3(fac ?? [0.5, 0.5, 0.5]);
    const tex = generateCurveTexture(cd);
    const fNode = toFloat(fac);
    return tslTexture(
      tex,
      vec2(fNode, float(0)) as any,
    ) as unknown as NodeValue;
  },

  "curve-float": (ctx) => {
    const fac = ctx.getInput("fac") ?? ctx.getInput("value") ?? 0.5;
    const cd = ctx.node.curveData;
    if (!cd) return toFloat(fac ?? 0.5);
    const tex = generateCurveTexture(cd);
    const fNode = toFloat(fac);
    const sampled = tslTexture(tex, vec2(fNode, float(0)) as any);
    return (sampled as any).r as unknown as NodeValue;
  },

  "combine-color": (ctx) => {
    const mode = ctx.getProps<string>("mode", "RGB");
    const r = toFloat(ctx.getInput("red") ?? 0);
    const g = toFloat(ctx.getInput("green") ?? 0);
    const b = toFloat(ctx.getInput("blue") ?? 0);
    const rgb = vec3(r, g, b) as any;
    if (mode === "HSV" || mode === "HSL")
      return mx_hsvtorgb(rgb) as unknown as NodeValue;
    return rgb as unknown as NodeValue;
  },

  "separate-color": (ctx) => {
    const mode = ctx.getProps<string>("mode", "RGB");
    const c = toVec3(ctx.getInput("color") ?? [0.5, 0.5, 0.5]);
    if (mode === "HSV" || mode === "HSL") {
      const hsv = mx_rgbtohsv(c) as any;
      return {
        red: (hsv as any).x,
        green: (hsv as any).y,
        blue: (hsv as any).z,
      };
    }
    return {
      red: (c as any).r as any,
      green: (c as any).g as any,
      blue: (c as any).b as any,
    };
  },

  clamp: (ctx) => {
    const v = toFloat(ctx.getInput("value") ?? 0);
    const minV = toFloat(ctx.getInput("min") ?? ctx.getProps("min", 0));
    const maxV = toFloat(ctx.getInput("max") ?? ctx.getProps("max", 1));
    return clamp(v, minV, maxV) as unknown as NodeValue;
  },

  "map-range": (ctx) => {
    const v = toFloat(ctx.getInput("value") ?? 0);
    const fMin = toFloat(ctx.getInput("from-min") ?? 0);
    const fMax = toFloat(ctx.getInput("from-max") ?? 1);
    const tMin = toFloat(ctx.getInput("to-min") ?? 0);
    const tMax = toFloat(ctx.getInput("to-max") ?? 1);
    const useClamp = ctx.getProps<boolean>("clamp", false);
    let out = remap(v, fMin, fMax, tMin, tMax) as any;
    if (useClamp) out = clamp(out, min(tMin, tMax), max(tMin, tMax));
    return out as unknown as NodeValue;
  },

  // ---- Converter nodes -------------------------------------------------------

  math: (ctx) => {
    const a = toFloat(ctx.getInput("value") ?? 0);
    const b = toFloat(ctx.getInput("value-001") ?? a);
    const c = toFloat(ctx.getInput("value-002") ?? 0);
    const op = ctx.getProps<string>("operation", "ADD");
    const fn = MATH_OPS[op] ?? MATH_OPS.ADD!;
    return fn(a, b, c) as unknown as NodeValue;
  },

  "vector-math": (ctx) => {
    const a = toVec3(ctx.getInput("vector") ?? [0, 0, 0]);
    const b = toVec3(ctx.getInput("vector-001") ?? [0, 0, 0]);
    const c = toVec3(ctx.getInput("vector-002") ?? [0, 0, 0]);
    const op = ctx.getProps<string>("operation", "ADD");
    const fn = VEC_MATH_OPS[op] ?? VEC_MATH_OPS.ADD!;
    return fn(a, b, c) as unknown as NodeValue;
  },

  sepxyz: (ctx) => {
    const v = toVec3(ctx.getInput("vector") ?? [0, 0, 0]);
    return {
      x: (v as any).x as any,
      y: (v as any).y as any,
      z: (v as any).z as any,
    };
  },

  seprgb: (ctx) => {
    const v = toVec3(
      ctx.getInput("image") ?? ctx.getInput("color") ?? [0, 0, 0],
    );
    return {
      r: (v as any).r as any,
      g: (v as any).g as any,
      b: (v as any).b as any,
    };
  },

  combxyz: (ctx) => {
    const x = toFloat(ctx.getInput("x") ?? 0);
    const y = toFloat(ctx.getInput("y") ?? 0);
    const z = toFloat(ctx.getInput("z") ?? 0);
    return vec3(x, y, z) as unknown as NodeValue;
  },

  combrgb: (ctx) => {
    const r = toFloat(ctx.getInput("r") ?? ctx.getInput("red") ?? 0);
    const g = toFloat(ctx.getInput("g") ?? ctx.getInput("green") ?? 0);
    const b = toFloat(ctx.getInput("b") ?? ctx.getInput("blue") ?? 0);
    return vec3(r, g, b) as unknown as NodeValue;
  },

  "vector-rotate": (ctx) => {
    const v = toVec3(ctx.getInput("vector") ?? [0, 0, 0]);
    const axis = toVec3(ctx.getInput("axis") ?? [0, 0, 1]);
    const angle = toFloat(ctx.getInput("angle") ?? 0);
    const rot = ctx.getProps<string>("rotation_type", "EULER");
    if (rot === "AXIS_ANGLE") {
      return rotate(v, mul(axis, angle) as any) as unknown as NodeValue;
    }
    const euler = toVec3(ctx.getInput("rotation") ?? [0, 0, 0]);
    return rotate(v, euler as any) as unknown as NodeValue;
  },

  "vector-transform": (ctx) => {
    return toVec3(ctx.getInput("vector") ?? [0, 0, 0]) as unknown as NodeValue;
  },

  mapping: (ctx) => {
    const v = toVec3(ctx.getInput("vector") ?? [0, 0, 0]);
    const loc = toVec3(ctx.getInput("location") ?? [0, 0, 0]);
    const rot = toVec3(ctx.getInput("rotation") ?? [0, 0, 0]);
    const scale = toVec3(ctx.getInput("scale") ?? [1, 1, 1]);
    let out = mul(v, scale) as any;
    out = rotate(out, rot) as any;
    out = add(out, loc) as any;
    return out as unknown as NodeValue;
  },

  "vector-displacement": (ctx) => {
    const d = toVec3(ctx.getInput("displacement") ?? [0, 0, 0]);
    return add(positionLocal as any, d) as unknown as NodeValue;
  },

  displacement: (ctx) => {
    const d = toFloat(
      ctx.getInput("height") ?? ctx.getInput("displacement") ?? 0,
    );
    return add(
      positionLocal as any,
      mul(normalLocal as any, d),
    ) as unknown as NodeValue;
  },

  "normal-map": (ctx) => {
    const strength = toFloat(ctx.getInput("strength") ?? 1);
    const colorIn = ctx.getInput("color");
    let texNode: any;
    if (isNodeRecord(colorIn)) {
      texNode = toNode((colorIn as any).color ?? colorIn);
    } else {
      texNode = toNode(colorIn ?? [0.5, 0.5, 1]);
    }
    return normalMap(texNode, strength) as unknown as NodeValue;
  },

  bump: (ctx) => {
    const strength = toFloat(ctx.getInput("strength") ?? 1);
    const distance = toFloat(ctx.getInput("distance") ?? 1);
    const height = ctx.getInput("height");
    let texNode: any;
    if (isNodeRecord(height)) {
      texNode = toNode((height as any).color ?? height);
    } else {
      texNode = toNode(height ?? 0);
    }
    return bumpMap(
      texNode,
      mul(strength, distance) as any,
    ) as unknown as NodeValue;
  },

  normal: (ctx) => {
    const n = toVec3(ctx.getInput("normal") ?? [0, 0, 1]);
    const strength = toFloat(ctx.getInput("strength") ?? 1);
    return normalize(
      mix(normalLocal as any, n, strength) as any,
    ) as unknown as NodeValue;
  },

  // ---- Fallback — first connected or default input --------------------------
  default: (ctx) => {
    for (const sock of ctx.node.inputs) {
      if (sock.value !== undefined) return sock.value as NodeValue;
      if (sock.fromNode) return ctx.getInput(sock.name) ?? 0;
    }
    return 0;
  },
};

// ---------------------------------------------------------------------------
// Graph evaluation
// ---------------------------------------------------------------------------

interface BSDFLike {
  __bsdf: string;
  [k: string]: unknown;
}

function evaluateShaderGraph(
  graph: ShaderGraph,
  resolveImage: (
    name: string,
    kind: "color" | "noncolor",
  ) => THREE.Texture | null,
): Record<string, unknown> | null {
  const outNode = graph.nodes.find((n) => n.type === "output-material");
  if (!outNode) return null;

  const nodeById = new Map<string, BlenderNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  const evalCache = new Map<string, NodeValue>();
  const visiting = new Set<string>();

  const evalNode = (nodeId: string): NodeValue | null | undefined => {
    if (evalCache.has(nodeId)) return evalCache.get(nodeId);
    if (visiting.has(nodeId)) return null;
    visiting.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) {
      visiting.delete(nodeId);
      return null;
    }

    const getInput = (name: string): NodeValue | null | undefined => {
      const sock = node.inputs.find(
        (s) => s.name === name || s.display === name,
      );
      if (!sock) return null;
      if (sock.fromNode) {
        const up = evalNode(sock.fromNode);
        if (up == null) return null;
        if (isNodeRecord(up) && sock.fromSocket) {
          const rec = up as Record<string, NodeValue>;
          if (sock.fromSocket in rec) return rec[sock.fromSocket];
        }
        return up;
      }
      return sock.value as NodeValue | null | undefined;
    };

    const ctx: NodeCtx = {
      node,
      getInput,
      getProps: <T>(name: string, fallback: T): T => {
        const v = (node.props ?? {})[name];
        return v === undefined ? fallback : (v as T);
      },
      resolveImage,
    };

    const builder = NODE_BUILDERS[node.type] ?? NODE_BUILDERS.default!;
    const result = builder(ctx);
    visiting.delete(nodeId);
    evalCache.set(nodeId, result);
    return result;
  };

  const surfaceSock = outNode.inputs.find((s) => s.name === "surface");
  if (!surfaceSock || !surfaceSock.fromNode) return null;

  const result = evalNode(surfaceSock.fromNode);
  if (isNodeRecord(result)) {
    return result as unknown as Record<string, unknown>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// BSDF resolution — flatten mix/add shaders into a single param set
// ---------------------------------------------------------------------------

type BSDFParams = Record<string, unknown>;

function defaultParam(name: string): unknown {
  switch (name) {
    case "baseColor":
      return [1, 1, 1];
    case "roughness":
      return 0.5;
    case "metallic":
      return 0;
    case "alpha":
      return 1;
    case "emissiveColor":
      return [0, 0, 0];
    case "emissiveStrength":
      return 0;
    case "ior":
      return 1.45;
    case "clearcoat":
      return 0;
    case "clearcoatRoughness":
      return 0.03;
    case "sheen":
      return 0;
    case "sheenRoughness":
      return 0.5;
    case "sheenTint":
      return 0.5;
    case "specular":
      return 0.5;
    case "specularTint":
      return 0;
    case "anisotropic":
      return 0;
    case "transmission":
      return 0;
    case "transmissionRoughness":
      return 0;
    case "thickness":
      return 0;
    case "clearcoatNormal":
      return [0, 0, 1];
    case "iridescence":
      return 0;
    case "iridescenceThickness":
      return 0;
    case "iridescenceIOR":
      return 1.3;
    case "dispersion":
      return 0;
    case "attenuationDistance":
      return 0;
    case "attenuationColor":
      return [1, 1, 1];
    default:
      return undefined;
  }
}

function resolveBSDF(bsdf: BSDFLike, depth = 0): BSDFParams {
  if (depth > 8) return {};

  if (bsdf.__bsdf === "mix") {
    const fac = toFloat(bsdf.mixFac as any);
    const a = (bsdf.shaderA as BSDFLike) ?? ({} as BSDFLike);
    const b = (bsdf.shaderB as BSDFLike) ?? ({} as BSDFLike);
    const pa = resolveBSDF(a, depth + 1);
    const pb = resolveBSDF(b, depth + 1);
    const out: BSDFParams = {};
    const keys = new Set([...Object.keys(pa), ...Object.keys(pb)]);
    const VEC3_KEYS = new Set([
      "baseColor",
      "clearcoatNormal",
      "attenuationColor",
      "emissiveColor",
      "sheenTint",
      "specularTint",
    ]);
    for (const k of keys) {
      const av = pa[k] ?? defaultParam(k);
      const bv = pb[k] ?? defaultParam(k);
      if (VEC3_KEYS.has(k)) {
        out[k] = mix(
          toVec3(av as any),
          toVec3(bv as any),
          fac,
        ) as unknown as NodeValue;
      } else {
        out[k] = mix(
          toFloat(av as any),
          toFloat(bv as any),
          fac,
        ) as unknown as NodeValue;
      }
    }
    return out;
  }

  if (bsdf.__bsdf === "add") {
    const a = (bsdf.shaderA as BSDFLike) ?? ({} as BSDFLike);
    const b = (bsdf.shaderB as BSDFLike) ?? ({} as BSDFLike);
    const pa = resolveBSDF(a, depth + 1);
    const pb = resolveBSDF(b, depth + 1);
    const out: BSDFParams = {};
    for (const k of Object.keys(pa)) {
      const av = pa[k];
      const bv = pb[k] ?? defaultParam(k);
      if (
        k === "baseColor" ||
        k === "emissiveColor" ||
        k === "attenuationColor"
      ) {
        out[k] = add(
          toVec3(av as any),
          toVec3(bv as any),
        ) as unknown as NodeValue;
      } else {
        out[k] = add(
          toFloat(av as any),
          toFloat(bv as any),
        ) as unknown as NodeValue;
      }
    }
    return out;
  }

  const out: BSDFParams = {};
  for (const [k, v] of Object.entries(bsdf)) {
    if (k === "__bsdf") continue;
    if (v != null) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// applyChannels — drive the material from the resolved graph channels.
//
// TSL-first override rule (tsl.md §2.4 / §5):
//   * set a `*Node` property ONLY when the channel is actually linked (a live
//     TSL node / texture sample / record). Otherwise set the classic property.
//   * This prevents `useClearcoat`/`useTransmission`/`useIridescence`/
//     `useAnisotropy` from activating at value 0.
// ---------------------------------------------------------------------------

function isLiveNode(
  v: unknown,
): v is THREE.Node | TextureValue | Record<string, unknown> {
  return (
    v instanceof THREE.Node ||
    isTextureValue(v) ||
    (isNodeRecord(v) &&
      Object.values(v).some(
        (x) => x instanceof THREE.Node || isTextureValue(x),
      ))
  );
}

/** Coerce a channel value into a vec3 TSL node (unwrap records / textures). */
function channelToVec3(v: unknown): any {
  if (isNodeRecord(v)) {
    return toVec3((v as any).color ?? (v as any).rgb ?? v);
  }
  return toVec3(v as any);
}

/** Coerce a channel value into a float TSL node. */
function channelToFloat(v: unknown): any {
  if (isNodeRecord(v)) {
    const rec = v as any;
    return toFloat(rec.fac ?? rec.r ?? rec.x ?? rec.color ?? v);
  }
  return toFloat(v as any);
}

function applyChannels(
  mat: THREE.MeshPhysicalNodeMaterial,
  ch: BSDFParams,
): void {
  // ---- Base color ----------------------------------------------------------
  if (ch.baseColor != null) {
    if (isLiveNode(ch.baseColor)) {
      mat.colorNode = channelToVec3(ch.baseColor);
      mat.map = null; // colorNode swallows the classic map — graph owns textures
    } else {
      const c = ch.baseColor as number[];
      mat.color.setRGB(c[0] ?? 1, c[1] ?? 1, c[2] ?? 1);
    }
  }

  // ---- Roughness / metallic ------------------------------------------------
  if (ch.roughness != null) {
    if (isLiveNode(ch.roughness))
      mat.roughnessNode = channelToFloat(ch.roughness);
    else mat.roughness = ch.roughness as number;
  }
  if (ch.metallic != null) {
    if (isLiveNode(ch.metallic))
      mat.metalnessNode = channelToFloat(ch.metallic);
    else mat.metalness = ch.metallic as number;
  }

  // ---- Emissive -------------------------------------------------------------
  const ec = ch.emissiveColor;
  const es = ch.emissiveStrength;
  if (ec != null || es != null) {
    const ecLive = ec != null && isLiveNode(ec);
    const esLive = es != null && isLiveNode(es);
    if (ecLive || esLive) {
      mat.emissiveNode = channelToVec3(ec ?? [0, 0, 0]).mul(
        channelToFloat(es ?? 1),
      );
    } else {
      const c = (ec as number[]) ?? [0, 0, 0];
      mat.emissive.setRGB(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);
      if (typeof es === "number") mat.emissiveIntensity = es;
    }
  }

  // ---- Alpha ----------------------------------------------------------------
  if (ch.alpha != null) {
    if (isLiveNode(ch.alpha)) {
      mat.opacityNode = channelToFloat(ch.alpha);
      mat.transparent = true;
    } else if ((ch.alpha as number) < 1) {
      mat.opacity = ch.alpha as number;
      mat.transparent = true;
    }
  }

  // ---- Normal (already tangent-space via normalMap/bumpMap builders) --------
  if (ch.normal != null && isLiveNode(ch.normal)) {
    mat.normalNode = channelToVec3(ch.normal);
  }

  // ---- Physical channels (classic prop unless linked → *Node) ---------------
  const scalar = (
    key: string,
    prop: string,
    nodeProp: string,
    asVec2 = false,
  ): void => {
    const v = ch[key];
    if (v == null) return;
    if (isLiveNode(v)) {
      (mat as any)[nodeProp] = asVec2
        ? vec2(channelToFloat(v), float(0))
        : channelToFloat(v);
    } else if (typeof v === "number") {
      (mat as any)[prop] = v;
    }
  };

  scalar("transmission", "transmission", "transmissionNode");
  scalar("thickness", "thickness", "thicknessNode");
  scalar("ior", "ior", "iorNode");
  scalar("clearcoat", "clearcoat", "clearcoatNode");
  scalar("clearcoatRoughness", "clearcoatRoughness", "clearcoatRoughnessNode");
  scalar("sheenRoughness", "sheenRoughness", "sheenRoughnessNode");
  scalar("specular", "specularIntensity", "specularIntensityNode");
  scalar("iridescence", "iridescence", "iridescenceNode");
  scalar("iridescenceIOR", "iridescenceIOR", "iridescenceIORNode");
  scalar(
    "iridescenceThickness",
    "iridescenceThickness",
    "iridescenceThicknessNode",
  );
  scalar("dispersion", "dispersion", "dispersionNode");
  scalar(
    "attenuationDistance",
    "attenuationDistance",
    "attenuationDistanceNode",
  );
  scalar("anisotropic", "anisotropy", "anisotropyNode", true);

  // ---- Clearcoat normal -----------------------------------------------------
  if (ch.clearcoatNormal != null && isLiveNode(ch.clearcoatNormal)) {
    mat.clearcoatNormalNode = channelToVec3(ch.clearcoatNormal);
  }

  // ---- Sheen: colour = weight × mix(white, baseColor, sheenTint) ------------
  if (ch.sheen != null) {
    const tintLive = ch.sheenTint != null && isLiveNode(ch.sheenTint);
    const baseLive = ch.baseColor != null && isLiveNode(ch.baseColor);
    const sheenLive = isLiveNode(ch.sheen);
    if (tintLive || baseLive || sheenLive) {
      const tint =
        ch.sheenTint != null ? channelToFloat(ch.sheenTint) : float(0.5);
      const tintColor =
        ch.baseColor != null
          ? mix(color(1, 1, 1), channelToVec3(ch.baseColor), tint)
          : color(1, 1, 1);
      mat.sheenNode = channelToFloat(ch.sheen).mul(tintColor);
    } else {
      const w = ch.sheen as number;
      mat.sheen = w;
      if (ch.sheenTint != null || ch.baseColor != null) {
        const tint = (ch.sheenTint as number) ?? 0.5;
        const base = (ch.baseColor as number[]) ?? [1, 1, 1];
        mat.sheenColor.setRGB(
          1 + (base[0] - 1) * tint,
          1 + (base[1] - 1) * tint,
          1 + (base[2] - 1) * tint,
        );
      }
    }
  }

  // ---- Specular colour = mix(white, baseColor, specularTint) ----------------
  if (
    ch.specularTint != null &&
    (ch.specularTint != null || ch.baseColor != null)
  ) {
    const tintLive = ch.specularTint != null && isLiveNode(ch.specularTint);
    const baseLive = ch.baseColor != null && isLiveNode(ch.baseColor);
    if (tintLive || baseLive) {
      const tint =
        ch.specularTint != null ? channelToFloat(ch.specularTint) : float(0);
      mat.specularColorNode = mix(
        color(1, 1, 1),
        channelToVec3(ch.baseColor ?? [1, 1, 1]),
        tint,
      );
    } else {
      const tint = (ch.specularTint as number) ?? 0;
      const base = (ch.baseColor as number[]) ?? [1, 1, 1];
      mat.specularColor.setRGB(
        1 + (base[0] - 1) * tint,
        1 + (base[1] - 1) * tint,
        1 + (base[2] - 1) * tint,
      );
    }
  }

  // ---- Attenuation colour ---------------------------------------------------
  if (ch.attenuationColor != null) {
    if (isLiveNode(ch.attenuationColor)) {
      mat.attenuationColorNode = channelToVec3(ch.attenuationColor);
    } else {
      const c = ch.attenuationColor as number[];
      mat.attenuationColor.setRGB(c[0] ?? 1, c[1] ?? 1, c[2] ?? 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Main builder — graph path vs flat path
// ---------------------------------------------------------------------------

function setFlatProperties(
  mat: THREE.MeshPhysicalNodeMaterial,
  p: TSLMaterialParams,
): void {
  mat.color.setRGB(p.color[0], p.color[1], p.color[2]);
  mat.roughness = p.roughness;
  mat.metalness = p.metalness;
  if (p.emissiveIntensity > 0)
    mat.emissiveIntensity = 1.0 * p.emissiveIntensity;
  mat.emissiveMap = p.emissiveMap;
  mat.map = p.map;
  mat.roughnessMap = p.roughnessMap;
  mat.metalnessMap = p.metalnessMap;
  mat.normalMap = p.normalMap;
  mat.transparent = p.transparent;
  if (p.opacity < 1.0) mat.opacity = p.opacity;
  if (p.alphaTest > 0) mat.alphaTest = p.alphaTest;
  mat.flatShading = p.flatShading;

  // Physical material properties (defaults when not transferred from Blender)
  mat.transmission = p.transmission;
  if (p.transmissionMap) mat.transmissionMap = p.transmissionMap;
  mat.thickness = p.thickness;
  if (p.thicknessMap) mat.thicknessMap = p.thicknessMap;
  mat.ior = p.ior;
  mat.clearcoat = p.clearcoat;
  mat.clearcoatRoughness = p.clearcoatRoughness;
  if (p.clearcoatMap) mat.clearcoatMap = p.clearcoatMap;
  if (p.clearcoatRoughnessMap)
    mat.clearcoatRoughnessMap = p.clearcoatRoughnessMap;
  if (p.clearcoatNormalMap) mat.clearcoatNormalMap = p.clearcoatNormalMap;
  mat.sheen = p.sheen;
  mat.sheenRoughness = p.sheenRoughness;
  mat.sheenColor.setRGB(p.sheenColor[0], p.sheenColor[1], p.sheenColor[2]);
  if (p.sheenColorMap) mat.sheenColorMap = p.sheenColorMap;
  if (p.sheenRoughnessMap) mat.sheenRoughnessMap = p.sheenRoughnessMap;
  mat.specularIntensity = p.specularIntensity;
  mat.specularColor.setRGB(
    p.specularColor[0],
    p.specularColor[1],
    p.specularColor[2],
  );
  if (p.specularColorMap) mat.specularColorMap = p.specularColorMap;
  if (p.specularIntensityMap) mat.specularIntensityMap = p.specularIntensityMap;
  mat.iridescence = p.iridescence;
  if (p.iridescenceMap) mat.iridescenceMap = p.iridescenceMap;
  mat.iridescenceIOR = p.iridescenceIOR;
  mat.iridescenceThicknessRange = p.iridescenceThicknessRange;
  if (p.iridescenceThicknessMap)
    mat.iridescenceThicknessMap = p.iridescenceThicknessMap;
  mat.anisotropy = p.anisotropy;
  if (p.anisotropyMap) mat.anisotropyMap = p.anisotropyMap;
  mat.attenuationDistance = p.attenuationDistance;
  mat.attenuationColor.setRGB(
    p.attenuationColor[0],
    p.attenuationColor[1],
    p.attenuationColor[2],
  );
}

export function buildTSLMaterial(
  params: TSLMaterialParams,
): THREE.MeshPhysicalNodeMaterial {
  const { graph } = params;
  const mat = new THREE.MeshPhysicalNodeMaterial();

  // ------------------------------------------------------------------
  // Shader graph path — the node graph owns the material channels.
  // ------------------------------------------------------------------
  if (graph && Array.isArray(graph.nodes) && graph.nodes.length > 0) {
    const resolveImage = params.resolveImage ?? (() => null);
    const evaluated = evaluateShaderGraph(graph, resolveImage);
    if (evaluated) {
      // Flatten mix/add shader records into a single param set, then drive
      // the material channels (TSL-first, *Node only when linked).
      const channels = resolveBSDF(evaluated as BSDFLike);
      applyChannels(mat, channels);
    }
    // Material-level blend settings come from the flat fields (blend mode).
    mat.transparent = params.transparent;
    if (params.opacity < 1.0) mat.opacity = params.opacity;
    if (params.alphaTest > 0) mat.alphaTest = params.alphaTest;
    mat.flatShading = params.flatShading;
    return mat;
  }

  // ------------------------------------------------------------------
  // No graph — flat classic properties (previous behavior).
  // ------------------------------------------------------------------
  setFlatProperties(mat, params);
  // When a base color texture is present, set color to white so the texture
  // shows through un-darkened (Blender colour-picker is ignored when an Image
  // Texture is connected to Base Color).
  if (params.map) {
    mat.color.setRGB(1, 1, 1);
  }
  return mat;
}
