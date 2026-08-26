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
} from "three/tsl";
import type { GeoBuffer } from "../types/blenderTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single input socket on a Blender shader node. */
interface BlenderSocket {
  name: string;
  /** Display-name slug (may differ from `name` after Blender renames). */
  display?: string;
  /** Value when the socket is not connected (may be number, array, string). */
  value?: unknown;
  /** Connected node ID + output socket name. */
  fromNode?: string;
  fromSocket?: string;
}

/** A single color stop in a Blender Color Ramp. */
interface ColorStop {
  position: number;
  color: [number, number, number, number]; // RGBA
}

/** Serialised Color Ramp data from a VALTORGB node. */
interface ColorRampData {
  interpolation: string; // 'LINEAR' | 'CONSTANT' | 'EASE'
  stops: ColorStop[];
}

/** Serialised CurveMapping data from CURVE_RGB / CURVE_VEC / CURVE_FLOAT. */
interface CurveData {
  extend: string; // 'HORIZONTAL' | 'EXTRAPOLATED'
  /** One curve per channel; each curve is [x, y] points. */
  curves: [number, number][][];
  tmin: number;
  tmax: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/** Serialized Blender shader node. */
interface BlenderNode {
  id: string;
  type: string;
  label: string;
  /** Color Ramp data — present on VALTORGB nodes. */
  colorRamp?: ColorRampData;
  /** Curve data — present on CURVE_RGB / CURVE_VEC / CURVE_FLOAT. */
  curveData?: CurveData;
  /** Image color space name ('sRGB' | 'Non-Color' | …) — present on TEX_IMAGE. */
  colorspace?: string;
  /** Node config properties (operations, blend types, dimensions, …). */
  props?: Record<string, unknown>;
  /** Output sockets with default values (RGB / Value nodes carry value here). */
  outputs?: BlenderSocket[];
  inputs: BlenderSocket[];
}

/** The full shader graph for one material. */
export interface ShaderGraph {
  nodes: BlenderNode[];
}

/** Material parameters extracted from the shader graph. */
export interface TSLMaterialParams {
  geometry: THREE.BufferGeometry;
  graph?: ShaderGraph;
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
  /** Resolve an image texture by name (for TEX_IMAGE nodes inside the graph). */
  resolveImage?: (name: string, kind: "color" | "noncolor") => THREE.Texture | null;
  // Physical material properties
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
// Value model
// ---------------------------------------------------------------------------
// A node evaluation produces a "value" that can be coerced into a TSL node.
// This mirrors how Blender sockets flow: numbers, colour arrays, textures,
// live TSL nodes, or a record of named outputs (SEPXYZ, TEX_IMAGE, tex-coord).

/** A record of named outputs (SEPXYZ, TEX_IMAGE, tex-coord, …). */
interface NodeRecord {
  [key: string]: NodeValue;
}

type NodeValue = number | number[] | THREE.Color | THREE.Node | TextureValue | NodeRecord;

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

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

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
  // Record — not a scalar; callers should have unwrapped outputs first.
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

// ---------------------------------------------------------------------------
// Color Ramp — canvas-based gradient texture
// ---------------------------------------------------------------------------

/** Cached gradient textures keyed by a hash of the stop data. */
const _rampTextureCache = new Map<string, THREE.CanvasTexture>();

function generateColorRampTexture(
  stops: ColorStop[],
  _interpolation: string,
): THREE.CanvasTexture {
  const hash = JSON.stringify({ stops });
  const cached = _rampTextureCache.get(hash);
  if (cached) {
    cached.needsUpdate = true;
  }
  if (cached) return cached;

  const width = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  for (const stop of stops) {
    const r = Math.round(stop.color[0] * 255);
    const g = Math.round(stop.color[1] * 255);
    const b = Math.round(stop.color[2] * 255);
    const a = stop.color.length >= 4 ? stop.color[3] : 1;
    grad.addColorStop(stop.position, `rgba(${r},${g},${b},${a})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  _rampTextureCache.set(hash, tex);
  return tex;
}

function evaluateColorRampAt(
  factor: number,
  stops: ColorStop[],
  interpolation: string,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, factor));

  for (let i = 0; i < stops.length - 1; i++) {
    const p0 = stops[i].position;
    const p1 = stops[i + 1].position;
    if (t < p0 || t > p1) continue;

    const range = p1 - p0;
    if (Math.abs(range) < 0.00001)
      return stops[i].color.slice(0, 3) as [number, number, number];

    let segT = (t - p0) / range;
    if (interpolation === "CONSTANT") segT = segT >= 0.5 ? 1 : 0;
    else if (interpolation === "EASE") segT = segT * segT * (3 - 2 * segT);

    return [
      stops[i].color[0] + (stops[i + 1].color[0] - stops[i].color[0]) * segT,
      stops[i].color[1] + (stops[i + 1].color[1] - stops[i].color[1]) * segT,
      stops[i].color[2] + (stops[i + 1].color[2] - stops[i].color[2]) * segT,
    ];
  }

  const last = stops[stops.length - 1];
  return last.color.slice(0, 3) as [number, number, number];
}

/** Marker returned by VALTORGB evaluation to signal a ramp texture override. */
interface RampTextureMarker {
  __rampTexture: true;
  texture: THREE.CanvasTexture;
  constantColor?: [number, number, number];
}

// ---------------------------------------------------------------------------
// Curve mapping (CURVE_RGB / CURVE_VEC / CURVE_FLOAT)
// ---------------------------------------------------------------------------

const _curveTextureCache = new Map<string, THREE.CanvasTexture>();

/** Bake a CurveMapping into a 256×4 lookup texture (RGBA = 4 channels). */
function generateCurveTexture(data: CurveData): THREE.CanvasTexture {
  const hash = JSON.stringify(data);
  const cached = _curveTextureCache.get(hash);
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
    // Clamp to [ymin, ymax] unless extrapolating.
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
  _curveTextureCache.set(hash, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Node registry — each Blender node type maps to a TSL expression builder.
// ---------------------------------------------------------------------------

interface NodeCtx {
  node: BlenderNode;
  getInput: (name: string) => NodeValue | null | undefined;
  getProps: <T>(name: string, fallback: T) => T;
  resolveImage: (name: string, kind: "color" | "noncolor") => THREE.Texture | null;
}

/** Fresnel term: pow(1 - dot(N, V), power). */
function fresnelNode(power: any): any {
  const n = normalView as any;
  const v = normalize(positionViewDirection as any);
  const d = clamp(dot(n, v) as any, float(0), float(1));
  return pow(oneMinus(d) as any, power);
}

// --- Math operations (Blender MATH node) ----------------------------------

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
  ADD: (a, b, fac) => blendFactor(a, b, fac, clamp(add(a, b), float(0), float(1))),
  OVERLAY: (a, b, fac) => blendFactor(a, b, fac, blendOverlay(a, b)),
  SOFT_LIGHT: (a, b, fac) =>
    blendFactor(a, b, fac, mix(mul(a, b), sub(add(mul(float(2), a), b), float(1)), step(float(0.5), a))),
  LINEAR_LIGHT: (a, b, fac) =>
    blendFactor(a, b, fac, clamp(add(a, sub(mul(float(2), b), float(1))), float(0), float(1))),
  DIFFERENCE: (a, b, fac) => blendFactor(a, b, fac, abs(sub(a, b))),
  SUBTRACT: (a, b, fac) => blendFactor(a, b, fac, clamp(sub(a, b), float(0), float(1))),
  DIVIDE: (a, b, fac) => blendFactor(a, b, fac, clamp(div(a, b), float(0), float(1))),
  HUE: (a, b, fac) => blendFactor(a, b, fac, b),
  SATURATION: (a, b, fac) => blendFactor(a, b, fac, b),
  COLOR: (a, b, fac) => blendFactor(a, b, fac, b),
  VALUE: (a, b, fac) => blendFactor(a, b, fac, b),
};

// ---------------------------------------------------------------------------
// Recursive shader graph evaluator
// ---------------------------------------------------------------------------

const NODE_BUILDERS: Record<string, (ctx: NodeCtx) => any> = {
  // ---- Terminal ----------------------------------------------------------
  "output-material": (ctx) => ctx.getInput("surface") ?? 0,

  // ---- BSDF / shader nodes ------------------------------------------------
  "bsdf-principled": (ctx) => {
    // Blender renamed several sockets across versions — match by identifier OR
    // display slug so the same builder works for old and new node trees.
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
      ior: first("ior"),
      clearcoat: first("clearcoat", "coat", "coat-weight"),
      clearcoatRoughness: first("clearcoat-roughness", "coat-roughness"),
      sheen: first("sheen", "sheen-weight"),
      sheenRoughness: first("sheen-roughness"),
      sheenTint: first("sheen-tint"),
      specular: first("specular", "specular-ior-level"),
      specularTint: first("specular-tint"),
      anisotropic: first("anisotropic", "anisotropic"),
      anisotropicRotation: first("anisotropic-rotation"),
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
    emissiveColor: ctx.getInput("color") ?? ctx.getInput("color") ?? null,
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

  uvmap: () => ({ uv: tslUV() as unknown as NodeValue }),

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

  fresnel: (ctx) => {
    const ior = toFloat(ctx.getInput("ior") ?? 1.45);
    // Blender: f = pow(1 - dot(N,V), power), power = 5 hard-coded in cycles
    // for IOR-based fresnel. We approximate power from IOR.
    const power = ior > 1.0 ? float(5) : float(3);
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

  "vertex-color": () => ({ color: vertexColor() as unknown as NodeValue, alpha: float(1) }),

  wireframe: () => ({ fac: float(1) }),

  // ---- Texture nodes --------------------------------------------------------

  "tex-image": (ctx) => {
    const name = ctx.getInput("image");
    const imgName = typeof name === "string" ? name : undefined;
    const kind: "color" | "noncolor" =
      ctx.node.colorspace === "Non-Color" ? "noncolor" : "color";
    const tex = imgName ? ctx.resolveImage(imgName, kind) : null;
    if (!tex) return { color: [0, 0, 0], alpha: float(1) };

    // Custom vector input (tex-coord / mapping / …)
    const vec = ctx.getInput("vector");
    let uvNode: any | undefined;
    if (isNodeRecord(vec)) {
      const inner = (vec as Record<string, NodeValue>).uv;
      if (inner) uvNode = toVec3(inner);
    } else if (vec != null) {
      uvNode = toVec3(vec);
    }

    return {
      color: { __texture: tex, __uv: uvNode } as TextureValue,
      alpha: { __texture: tex, __uv: uvNode } as TextureValue,
    };
  },

  "tex-noise": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const detail = toFloat(ctx.getInput("detail") ?? 2);
    const roughness = toFloat(ctx.getInput("roughness") ?? 0.5);
    const distortion = toFloat(ctx.getInput("distortion") ?? 0);
    const vector = ctx.getInput("vector");
    const pos = isNodeRecord(vector) ? toVec3((vector as any).uv) : toVec3(vector ?? [0, 0, 0]);
    const scaled = mul(pos, scale) as any;
    const noiseType = ctx.getProps<string>("noise_type", "FBM");
    let fac: any;
    if (noiseType === "PERLIN") {
      fac = mx_noise_float(scaled) as any;
    } else {
      fac = mx_fractal_noise_float(scaled, detail, float(2), roughness) as any;
    }
    // Distortion — offset position by additional noise before sampling.
    if ((distortion as any).isNode === true) {
      const off = mul(mx_noise_float(mul(pos, scale)) as any, distortion);
      fac = mx_noise_float(add(scaled, off) as any) as any;
    }
    const colored = vec3(fac, fac, fac) as any;
    return { fac, color: colored };
  },

  "tex-voronoi": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const vector = ctx.getInput("vector");
    const pos = isNodeRecord(vector) ? toVec3((vector as any).uv) : toVec3(vector ?? [0, 0, 0]);
    const scaled = mul(pos, scale) as any;
    const fac = mx_worley_noise_float(scaled) as any;
    const colored = vec3(fac, fac, fac) as any;
    return { distance: fac, color: colored, position: pos };
  },

  "tex-checker": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const c1 = toVec3(ctx.getInput("color1") ?? [0.8, 0.8, 0.8]);
    const c2 = toVec3(ctx.getInput("color2") ?? [0.2, 0.2, 0.2]);
    const vector = ctx.getInput("vector");
    const pos = isNodeRecord(vector) ? toVec3((vector as any).uv) : toVec3(vector ?? [0, 0, 0]);
    const cell = checker(mul(pos, scale) as any) as any;
    const col = mix(c2, c1, cell);
    return { color: col, fac: cell };
  },

  "tex-gradient": (ctx) => {
    const vector = ctx.getInput("vector");
    const pos = isNodeRecord(vector) ? toVec3((vector as any).uv) : toVec3(vector ?? [0, 0, 0]);
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
    const pos = isNodeRecord(vector) ? toVec3((vector as any).uv) : toVec3(vector ?? [0, 0, 0]);
    const scaled = mul(pos, scale) as any;
    const fac = mx_fractal_noise_float(scaled, detail, float(2), roughness) as any;
    return { fac, color: vec3(fac, fac, fac) as any };
  },

  "tex-wave": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const vector = ctx.getInput("vector");
    const pos = isNodeRecord(vector) ? toVec3((vector as any).uv) : toVec3(vector ?? [0, 0, 0]);
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
    const pos = isNodeRecord(vector) ? toVec3((vector as any).uv) : toVec3(vector ?? [0, 0, 0]);
    const fac = triNoise3D(mul(pos, scale) as any, float(0), float(1)) as any;
    return { color: vec3(fac, fac, fac) as any, fac };
  },

  "tex-brick": (ctx) => {
    const scale = toFloat(ctx.getInput("scale") ?? 5);
    const c1 = toVec3(ctx.getInput("color1") ?? [0.8, 0.2, 0.2]);
    const c2 = toVec3(ctx.getInput("color2") ?? [0.4, 0.4, 0.4]);
    const vector = ctx.getInput("vector");
    const pos = isNodeRecord(vector) ? toVec3((vector as any).uv) : toVec3(vector ?? [0, 0, 0]);
    const p = mul(pos, scale) as any;
    const x = fract((p as any).x as any) as any;
    const y = fract((p as any).y as any) as any;
    const brick = select(lessThan(y, float(0.5)), step(float(0.5), x), step(float(0.25), x)) as any;
    const col = mix(c2, c1, brick);
    return { color: col, fac: brick };
  },

  "tex-mask": (ctx) => {
    const c1 = toVec3(ctx.getInput("color1") ?? [1, 1, 1]);
    const c2 = toVec3(ctx.getInput("color2") ?? [0, 0, 0]);
    const col = mix(c2, c1, float(0.5));
    return { color: col, fac: float(0.5) };
  },

  "tex-environment": (ctx) => {
    const name = ctx.getInput("image");
    const imgName = typeof name === "string" ? name : undefined;
    const tex = imgName ? ctx.resolveImage(imgName, "color") : null;
    if (!tex) return { color: [0, 0, 0] };
    const vec = ctx.getInput("vector");
    let uvNode: any | undefined;
    if (isNodeRecord(vec)) {
      const inner = (vec as Record<string, NodeValue>).uv;
      if (inner) uvNode = toVec3(inner);
    } else if (vec != null) {
      uvNode = toVec3(vec);
    }
    return {
      color: { __texture: tex, __uv: uvNode } as TextureValue,
    };
  },

  // ---- Color nodes ----------------------------------------------------------

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
    const adjusted = mul(saturation(hue(c, hue) as any, sat) as any, val) as any;
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
    return add(mul(sub(c, vec3(0.5, 0.5, 0.5)), contrast), add(c, vec3(bright, bright, bright))) as unknown as NodeValue;
  },

  "valtorgb": (ctx) => {
    const fac = ctx.getInput("fac");
    const rampData = ctx.node.colorRamp;
    if (!rampData || !rampData.stops || rampData.stops.length < 2) {
      const fv = typeof fac === "number" ? fac : 0.5;
      return [fv, fv, fv] as number[];
    }
    const tex = generateColorRampTexture(rampData.stops, rampData.interpolation);

    if (typeof fac === "number") {
      return {
        __rampTexture: true,
        texture: tex,
        constantColor: evaluateColorRampAt(fac, rampData.stops, rampData.interpolation),
      } satisfies RampTextureMarker;
    }
    // TSL-driven factor — sample the ramp texture.
    const fNode = toFloat(fac);
    const sampled = tslTexture(tex, vec2(fNode, float(0)) as any);
    return sampled as unknown as NodeValue;
  },

  "curve-rgb": (ctx) => {
    const fac = ctx.getInput("fac") ?? ctx.getInput("value") ?? 0.5;
    const c = ctx.getInput("color");
    const cd = ctx.node.curveData;
    if (!cd) return toVec3(c ?? fac ?? [0.5, 0.5, 0.5]);
    const tex = generateCurveTexture(cd);
    const fNode = toFloat(fac);
    const sampled = tslTexture(tex, vec2(fNode, float(0)) as any);
    return sampled as unknown as NodeValue;
  },

  "curve-vec": (ctx) => {
    const fac = ctx.getInput("fac") ?? ctx.getInput("value") ?? 0.5;
    const cd = ctx.node.curveData;
    if (!cd) return toVec3(fac ?? [0.5, 0.5, 0.5]);
    const tex = generateCurveTexture(cd);
    const fNode = toFloat(fac);
    const sampled = tslTexture(tex, vec2(fNode, float(0)) as any);
    return sampled as unknown as NodeValue;
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
    if (mode === "HSV") return mx_hsvtorgb(rgb) as unknown as NodeValue;
    if (mode === "HSL") return mx_hsvtorgb(rgb) as unknown as NodeValue;
    return rgb as unknown as NodeValue;
  },

  "separate-color": (ctx) => {
    const mode = ctx.getProps<string>("mode", "RGB");
    const c = toVec3(ctx.getInput("color") ?? [0.5, 0.5, 0.5]);
    if (mode === "HSV") {
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

  "sepxyz": (ctx) => {
    const v = toVec3(ctx.getInput("vector") ?? [0, 0, 0]);
    return { x: (v as any).x as any, y: (v as any).y as any, z: (v as any).z as any };
  },

  "seprgb": (ctx) => {
    const v = toVec3(ctx.getInput("image") ?? ctx.getInput("color") ?? [0, 0, 0]);
    return { r: (v as any).r as any, g: (v as any).g as any, b: (v as any).b as any };
  },

  "combxyz": (ctx) => {
    const x = toFloat(ctx.getInput("x") ?? 0);
    const y = toFloat(ctx.getInput("y") ?? 0);
    const z = toFloat(ctx.getInput("z") ?? 0);
    return vec3(x, y, z) as unknown as NodeValue;
  },

  "combrgb": (ctx) => {
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
    return rotate(v, mul(axis, angle) as any) as unknown as NodeValue;
  },

  "vector-transform": (ctx) => {
    const v = toVec3(ctx.getInput("vector") ?? [0, 0, 0]);
    const from = ctx.getProps<string>("convert_from", "WORLD");
    const to = ctx.getProps<string>("convert_to", "WORLD");
    if (from === "OBJECT" && to === "WORLD") return v;
    if (from === "WORLD" && to === "OBJECT") return v;
    return v;
  },

  mapping: (ctx) => {
    const v = toVec3(ctx.getInput("vector") ?? [0, 0, 0]);
    const loc = toVec3(ctx.getInput("location") ?? [0, 0, 0]);
    const rot = toVec3(ctx.getInput("rotation") ?? [0, 0, 0]);
    const scale = toVec3(ctx.getInput("scale") ?? [1, 1, 1]);
    let out = mul(v, scale) as any;
    // Approximate rotation (Euler ZYX)
    out = rotate(out, rot) as any;
    out = add(out, loc) as any;
    return out as unknown as NodeValue;
  },

  "vector-displacement": (ctx) => {
    const d = toVec3(ctx.getInput("displacement") ?? [0, 0, 0]);
    return add(positionLocal as any, d) as unknown as NodeValue;
  },

  displacement: (ctx) => {
    const d = toFloat(ctx.getInput("height") ?? ctx.getInput("displacement") ?? 0);
    return add(positionLocal as any, mul((normalLocal as any), d)) as unknown as NodeValue;
  },

  "normal-map": (ctx) => {
    const strength = toFloat(ctx.getInput("strength") ?? 1);
    const color = ctx.getInput("color");
    let texNode: any;
    if (isNodeRecord(color)) {
      texNode = toNode((color as any).color ?? color);
    } else {
      texNode = toNode(color ?? [0.5, 0.5, 1]);
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
    return bumpMap(texNode, mul(strength, distance) as any) as unknown as NodeValue;
  },

  normal: (ctx) => {
    const n = toVec3(ctx.getInput("normal") ?? [0, 0, 1]);
    const strength = toFloat(ctx.getInput("strength") ?? 1);
    return normalize(mix(normalLocal as any, n, strength) as any) as unknown as NodeValue;
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

/** Entry point — walk the graph from OUTPUT_MATERIAL. */
function evaluateShaderGraph(
  graph: ShaderGraph,
  resolveImage: (name: string, kind: "color" | "noncolor") => THREE.Texture | null,
): Record<string, unknown> | null {
  const outNode = graph.nodes.find((n) => n.type === "output-material");
  if (!outNode) return null;

  const nodeById = new Map<string, BlenderNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  // Build a recursive resolver that follows fromNode/fromSocket links.
  const evalCache = new Map<string, NodeValue>();
  const visiting = new Set<string>();

  const evalNode = (nodeId: string): NodeValue | null | undefined => {
    if (evalCache.has(nodeId)) return evalCache.get(nodeId);
    // Cycle guard — a node referencing itself (or a cycle) returns null.
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
        // Multi-output upstream (SEPXYZ, TEX_IMAGE, tex-coord) — pick socket.
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

  // Evaluate the OUTPUT_MATERIAL surface socket.
  const surfaceNode = outNode;
  const surfaceSock = surfaceNode.inputs.find((s) => s.name === "surface");
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
    case "specular":
      return 0.5;
    case "specularTint":
      return 0;
    case "anisotropic":
      return 0;
    case "transmission":
      return 0;
    default:
      return undefined;
  }
}

/** Resolve a (possibly mixed) BSDF into a flat param object. */
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
    for (const k of keys) {
      const av = pa[k] ?? defaultParam(k);
      const bv = pb[k] ?? defaultParam(k);
      if (k === "baseColor") {
        out[k] = mix(toVec3(av as any), toVec3(bv as any), fac) as unknown as NodeValue;
      } else {
        out[k] = mix(toFloat(av as any), toFloat(bv as any), fac) as unknown as NodeValue;
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
      if (k === "baseColor") {
        out[k] = add(toVec3(av as any), toVec3(bv as any)) as unknown as NodeValue;
      } else {
        out[k] = add(toFloat(av as any), toFloat(bv as any)) as unknown as NodeValue;
      }
    }
    return out;
  }

  // Principled-like — copy param fields.
  const out: BSDFParams = {};
  for (const [k, v] of Object.entries(bsdf)) {
    if (k === "__bsdf") continue;
    if (v != null) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

function _setStandardProperties(
  mat: THREE.MeshPhysicalNodeMaterial,
  params: TSLMaterialParams,
): void {
  mat.color.setRGB(params.color[0], params.color[1], params.color[2]);
  mat.roughness = params.roughness;
  mat.metalness = params.metalness;
  if (params.emissiveIntensity > 0) {
    const ei = params.emissiveIntensity;
    mat.emissiveIntensity = 1.0 * ei;
  }
  mat.emissiveMap = params.emissiveMap;
  mat.map = params.map;
  mat.roughnessMap = params.roughnessMap;
  mat.metalnessMap = params.metalnessMap;
  mat.normalMap = params.normalMap;
  mat.transparent = params.transparent;
  if (params.opacity < 1.0) mat.opacity = params.opacity;
  if (params.alphaTest > 0) mat.alphaTest = params.alphaTest;
  mat.flatShading = params.flatShading;

  // Physical material properties
  mat.transmission = params.transmission;
  if (params.transmissionMap) mat.transmissionMap = params.transmissionMap;
  mat.thickness = params.thickness;
  if (params.thicknessMap) mat.thicknessMap = params.thicknessMap;
  mat.ior = params.ior;
  mat.clearcoat = params.clearcoat;
  mat.clearcoatRoughness = params.clearcoatRoughness;
  if (params.clearcoatMap) mat.clearcoatMap = params.clearcoatMap;
  if (params.clearcoatRoughnessMap)
    mat.clearcoatRoughnessMap = params.clearcoatRoughnessMap;
  if (params.clearcoatNormalMap)
    mat.clearcoatNormalMap = params.clearcoatNormalMap;
  mat.sheen = params.sheen;
  mat.sheenRoughness = params.sheenRoughness;
  mat.sheenColor.setRGB(
    params.sheenColor[0],
    params.sheenColor[1],
    params.sheenColor[2],
  );
  if (params.sheenColorMap) mat.sheenColorMap = params.sheenColorMap;
  if (params.sheenRoughnessMap)
    mat.sheenRoughnessMap = params.sheenRoughnessMap;
  mat.specularIntensity = params.specularIntensity;
  mat.specularColor.setRGB(
    params.specularColor[0],
    params.specularColor[1],
    params.specularColor[2],
  );
  if (params.specularColorMap) mat.specularColorMap = params.specularColorMap;
  if (params.specularIntensityMap)
    mat.specularIntensityMap = params.specularIntensityMap;
  mat.iridescence = params.iridescence;
  if (params.iridescenceMap) mat.iridescenceMap = params.iridescenceMap;
  mat.iridescenceIOR = params.iridescenceIOR;
  mat.iridescenceThicknessRange = params.iridescenceThicknessRange;
  if (params.iridescenceThicknessMap)
    mat.iridescenceThicknessMap = params.iridescenceThicknessMap;
  mat.anisotropy = params.anisotropy;
  if (params.anisotropyMap) mat.anisotropyMap = params.anisotropyMap;
  mat.attenuationDistance = params.attenuationDistance;
  mat.attenuationColor.setRGB(
    params.attenuationColor[0],
    params.attenuationColor[1],
    params.attenuationColor[2],
  );
}

/** Wire a resolved BSDF param object onto the material's TSL node properties. */
function _applyBSDF(mat: THREE.MeshPhysicalNodeMaterial, bsdf: BSDFParams): void {
  if (bsdf.baseColor != null) {
    const v = bsdf.baseColor;
    if (isNodeRecord(v)) {
      mat.colorNode = toVec3((v as any).color ?? v) as any;
      mat.map = null;
      mat.color.setRGB(1, 1, 1);
    } else if (typeof v === "object" && (v as any).__rampTexture) {
      const marker = v as RampTextureMarker;
      if (marker.constantColor) {
        mat.color.setRGB(marker.constantColor[0], marker.constantColor[1], marker.constantColor[2]);
      } else {
        mat.map = marker.texture;
        mat.color.setRGB(1, 1, 1);
      }
    } else {
      const n = toVec3(v as NodeValue);
      if (n) {
        mat.colorNode = n as any;
        mat.map = null;
        mat.color.setRGB(1, 1, 1);
      }
    }
  }

  if (bsdf.roughness != null) {
    const v = toFloat(bsdf.roughness as any);
    if (v) (mat as any).roughnessNode = v;
  }
  if (bsdf.metallic != null) {
    const v = toFloat(bsdf.metallic as any);
    if (v) (mat as any).metalnessNode = v;
  }
  if (bsdf.alpha != null) {
    const v = toFloat(bsdf.alpha as any);
    if (v) {
      (mat as any).opacityNode = v;
      mat.transparent = true;
    }
  }
  if (bsdf.normal != null) {
    const v = toVec3(bsdf.normal as any);
    if (v) (mat as any).normalNode = v;
  }
  if (bsdf.emissiveColor != null || bsdf.emissiveStrength != null) {
    const ec = toVec3(bsdf.emissiveColor as any);
    const es = toFloat(bsdf.emissiveStrength as any);
    if (ec && es) (mat as any).emissiveNode = mul(ec, es);
  }
  if (bsdf.transmission != null) {
    const v = toFloat(bsdf.transmission as any);
    if (v) (mat as any).transmissionNode = v;
  }
  if (bsdf.ior != null) {
    const v = toFloat(bsdf.ior as any);
    if (v) (mat as any).iorNode = v;
  }
  if (bsdf.clearcoat != null) {
    const v = toFloat(bsdf.clearcoat as any);
    if (v) (mat as any).clearcoatNode = v;
  }
  if (bsdf.clearcoatRoughness != null) {
    const v = toFloat(bsdf.clearcoatRoughness as any);
    if (v) (mat as any).clearcoatRoughnessNode = v;
  }
  if (bsdf.sheen != null) {
    const v = toFloat(bsdf.sheen as any);
    if (v) (mat as any).sheenNode = v;
  }
  if (bsdf.sheenRoughness != null) {
    const v = toFloat(bsdf.sheenRoughness as any);
    if (v) (mat as any).sheenRoughnessNode = v;
  }
  if (bsdf.specular != null) {
    const v = toFloat(bsdf.specular as any);
    if (v) (mat as any).specularIntensityNode = v;
  }
  if (bsdf.specularTint != null) {
    const v = toVec3(bsdf.specularTint as any);
    if (v) (mat as any).specularColorNode = v;
  }
  if (bsdf.anisotropic != null) {
    const v = toFloat(bsdf.anisotropic as any);
    if (v) (mat as any).anisotropyNode = v;
  }
}

export function buildTSLMaterial(
  params: TSLMaterialParams,
): THREE.MeshPhysicalNodeMaterial {
  const { graph } = params;

  // ------------------------------------------------------------------
  // Shader graph path
  // ------------------------------------------------------------------
  if (graph && Array.isArray(graph.nodes) && graph.nodes.length > 0) {
    const mat = new THREE.MeshPhysicalNodeMaterial();
    _setStandardProperties(mat, params);

    const resolveImage =
      params.resolveImage ?? (() => null);
    const result = evaluateShaderGraph(graph, resolveImage);
    if (result && (result as BSDFLike).__bsdf) {
      const flat = resolveBSDF(result as BSDFLike);
      _applyBSDF(mat, flat);
    }

    return mat;
  }

  // ------------------------------------------------------------------
  // No graph — standard MeshPhysicalNodeMaterial
  // ------------------------------------------------------------------
  const mat = new THREE.MeshPhysicalNodeMaterial();
  _setStandardProperties(mat, params);
  // When a base color texture is present, set color to white so the
  // texture shows through un-darkened (Blender colour-picker is ignored
  // when an Image Texture is connected to Base Color).
  if (params.map) {
    mat.color.setRGB(1, 1, 1);
  }
  return mat;
}

// ---------------------------------------------------------------------------
// Convenience — build geometry + material from a GeoBuffer
// ---------------------------------------------------------------------------

export function buildGeometryWithTSL(
  buf: GeoBuffer,
  params: Omit<TSLMaterialParams, "geometry">,
): {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial | THREE.MeshPhysicalNodeMaterial;
} {
  const geo = new THREE.BufferGeometry();

  geo.setAttribute("position", new THREE.BufferAttribute(buf.vertices, 3));
  geo.setIndex(new THREE.BufferAttribute(buf.indices, 1));

  if (buf.uvs && buf.uvs.length > 0) {
    geo.setAttribute("uv", new THREE.BufferAttribute(buf.uvs, 2));
  }

  geo.computeVertexNormals();

  if (params.normalMap) {
    geo.computeTangents();
  }

  const mat = buildTSLMaterial({ geometry: geo, ...params });

  return { geometry: geo, material: mat };
}
