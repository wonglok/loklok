import * as THREE from "three/webgpu";
import { vec3, texture as tslTexture, uv as tslUV } from "three/tsl";
import type { TextureData } from "../types/blenderTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single input socket on a Blender shader node. */
interface BlenderSocket {
  name: string;
  value?: unknown;
  fromNode?: string;
  fromSocket?: string;
}

/** A single color stop in a Blender Color Ramp. */
interface ColorStop {
  position: number;
  color: [number, number, number, number];
}

/** Serialised Color Ramp data from a VALTORGB node. */
interface ColorRampData {
  interpolation: string;
  stops: ColorStop[];
}

/** Serialized Blender shader node. */
interface BlenderNode {
  id: string;
  type: string;
  label: string;
  colorRamp?: ColorRampData;
  inputs: BlenderSocket[];
}

/** The full shader graph for one material. */
export interface ShaderGraph {
  nodes: BlenderNode[];
}

/** Material parameters — graph is the sole source of material properties. */
export interface TSLMaterialParams {
  graph?: ShaderGraph;
  texData: Map<string, TextureData>;
}

// ---------------------------------------------------------------------------
// Texture cache — resolves Blender image names → Three.js Textures
// ---------------------------------------------------------------------------

const _textureCache = new Map<string, THREE.Texture>();

function getOrCreateTexture(
  name: string,
  texData: Map<string, TextureData>,
): THREE.Texture | null {
  const existing = _textureCache.get(name);
  if (existing) return existing;

  const texEntry = texData.get(name);
  if (!texEntry) return null;

  const blob = new File([texEntry.bytes], "image.png", { type: texEntry.mime });
  const url = URL.createObjectURL(blob);
  const texture = new THREE.TextureLoader().load(url);

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;

  _textureCache.set(name, texture);
  return texture;
}

// ---------------------------------------------------------------------------
// Color Ramp — canvas-based gradient texture
// ---------------------------------------------------------------------------

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

interface RampTextureMarker {
  __rampTexture: true;
  texture: THREE.CanvasTexture;
  constantColor?: [number, number, number];
}

// ---------------------------------------------------------------------------
// Recursive shader graph evaluator
// ---------------------------------------------------------------------------

type EvalResult = unknown;

function evaluateNode(
  graph: ShaderGraph,
  visited: Set<string>,
  nodeId: string,
): EvalResult {
  if (visited.has(nodeId)) return undefined;
  visited.add(nodeId);

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;

  const getInput = (socketName: string): EvalResult => {
    const sock = node.inputs.find((s) => s.name === socketName);
    if (!sock) return undefined;
    if (sock.fromNode) {
      const up = evaluateNode(graph, new Set(visited), sock.fromNode);
      if (
        up &&
        typeof up === "object" &&
        !Array.isArray(up) &&
        sock.fromSocket &&
        sock.fromSocket in (up as Record<string, unknown>)
      ) {
        return (up as Record<string, unknown>)[sock.fromSocket];
      }
      return up;
    }
    return sock.value as EvalResult;
  };

  switch (node.type) {
    case "output-material":
      return getInput("surface");

    case "bsdf-principled":
      return {
        baseColor: getInput("base-color"),
        roughness: getInput("roughness"),
        metallic: getInput("metallic"),
        emissionColor: getInput("emission-color"),
        emissionStrength: getInput("emission-strength"),
        alpha: getInput("alpha"),
        normal: getInput("normal"),
        transmission: getInput("transmission"),
        transmissionRoughness: getInput("transmission-roughness"),
        ior: getInput("ior"),
        clearcoat: getInput("clearcoat"),
        clearcoatRoughness: getInput("clearcoat-roughness"),
        sheen: getInput("sheen"),
        sheenRoughness: getInput("sheen-roughness"),
        sheenTint: getInput("sheen-tint"),
        specular: getInput("specular"),
        specularTint: getInput("specular-tint"),
        anisotropic: getInput("anisotropic"),
        anisotropicRotation: getInput("anisotropic-rotation"),
      };

    case "tex-image": {
      const imageName = getInput("image") as string | undefined;
      const vecInput = getInput("vector");
      const useTexCoord =
        vecInput &&
        typeof vecInput === "object" &&
        "_isTexCoord" in (vecInput as any);
      return {
        _isTSLTexture: true,
        imageName,
        useTexCoord: !!useTexCoord,
      };
    }

    case "normal-map": {
      const strength = (getInput("strength") as number) ?? 1.0;
      const color = getInput("color") as string | undefined;
      return { type: "normalMap", strength, color };
    }

    case "mix-rgb": {
      const fac = (getInput("fac") as number) ?? 0.5;
      const a = getInput("color1");
      const b = getInput("color2");
      return { type: "mix", fac, a, b };
    }

    case "math": {
      const a = (getInput("value") as number) ?? 0;
      const b = (getInput("value-001") as number) ?? a;
      const op = (node.label || "ADD").toUpperCase();
      return { type: "math", op, a, b };
    }

    case "bump": {
      return {
        type: "bump",
        strength: (getInput("strength") as number) ?? 1.0,
        distance: (getInput("distance") as number) ?? 0.1,
        height: getInput("height"),
      };
    }

    case "tex-coord":
    case "uvmap":
      return { _isTexCoord: true };

    case "valtorgb": {
      const fac = getInput("fac") as number | undefined;
      const rampData = (node as BlenderNode & { colorRamp?: ColorRampData })
        .colorRamp;
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
      return { __rampTexture: true, texture: tex } satisfies RampTextureMarker;
    }

    case "sepxyz":
    case "seprgb": {
      const v = getInput("vector") ?? getInput("image");
      if (Array.isArray(v) && v.length >= 3) {
        return { x: v[0], y: v[1], z: v[2] };
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const swizzle = (ch: string) => ({
          _isSwizzled: true,
          source: v,
          channel: ch,
        });
        return {
          x: swizzle("r"),
          y: swizzle("g"),
          z: swizzle("b"),
        };
      }
      return { x: 0, y: 0, z: 0 };
    }

    case "combxyz":
    case "combrgb": {
      return [
        (getInput("x") as number) ?? 0,
        (getInput("y") as number) ?? 0,
        (getInput("z") as number) ?? 0,
      ] as number[];
    }

    case "hue-sat":
      return {
        type: "hueSat",
        hue: (getInput("hue") as number) ?? 0.5,
        saturation: (getInput("saturation") as number) ?? 1.0,
        value: (getInput("value") as number) ?? 1.0,
        color: getInput("color"),
      };

    case "curve-rgb":
      return getInput("color") ?? ([0.5, 0.5, 0.5] as number[]);

    default:
      for (const sock of node.inputs) {
        if (sock.value !== undefined) return sock.value as EvalResult;
        if (sock.fromNode)
          return evaluateNode(graph, new Set(visited), sock.fromNode);
      }
      return undefined;
  }
}

function evaluateShaderGraph(
  graph: ShaderGraph,
): Record<string, unknown> | null {
  const outNode = graph.nodes.find((n) => n.type === "output-material");
  if (!outNode) return null;
  return evaluateNode(graph, new Set(), outNode.id) as Record<
    string,
    unknown
  > | null;
}

// ---------------------------------------------------------------------------
// Resolve helpers
// ---------------------------------------------------------------------------

function resolveTSLNode(marker: any, mapTex: THREE.Texture | null): any {
  if (!marker || typeof marker !== "object") return null;

  if (marker._isSwizzled) {
    const src = resolveTSLNode(marker.source, mapTex);
    if (!src) return null;
    const ch = marker.channel as string;
    return (src as any)[ch];
  }

  if (marker._isTSLTexture && mapTex) {
    return tslTexture(mapTex, tslUV());
  }

  return marker;
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

/** Extract all image texture names referenced in a shader graph. */
export function getGraphImageNames(graph: ShaderGraph | undefined): string[] {
  if (!graph || !Array.isArray(graph.nodes)) return [];
  const names = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type === "tex-image") {
      const imageSock = node.inputs.find((s) => s.name === "image");
      if (imageSock && typeof imageSock.value === "string") {
        names.add(imageSock.value);
      }
    }
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Main builder — all material properties derived from the shader graph
// ---------------------------------------------------------------------------

export function buildTSLMaterial(
  params: TSLMaterialParams,
): THREE.MeshPhysicalNodeMaterial {
  const { graph, texData } = params;
  const mat = new THREE.MeshPhysicalNodeMaterial();

  // ---- Evaluate graph ----
  const bsdf = (graph && Array.isArray(graph.nodes) && graph.nodes.length > 0)
    ? evaluateShaderGraph(graph) as Record<string, any> | null
    : null;

  // ---- Resolve textures referenced by the graph ----
  const texFromGraph = (imageName: unknown): THREE.Texture | null => {
    if (typeof imageName === "string") {
      return getOrCreateTexture(imageName, texData);
    }
    return null;
  };

  // ---- Base color ----
  const baseColor: any = bsdf?.baseColor;
  if (baseColor) {
    if (baseColor.__rampTexture) {
      const marker = baseColor as RampTextureMarker;
      if (marker.constantColor) {
        mat.color.setRGB(marker.constantColor[0], marker.constantColor[1], marker.constantColor[2]);
      } else {
        mat.colorNode = tslTexture(marker.texture, tslUV()) as any;
        mat.color.setRGB(1, 1, 1);
      }
    } else if (baseColor._isTSLTexture) {
      const tex = texFromGraph(baseColor.imageName);
      if (tex) {
        mat.colorNode = tslTexture(tex, tslUV()) as any;
        mat.color.setRGB(1, 1, 1);
      }
    } else if (typeof baseColor === "object" && !Array.isArray(baseColor)) {
      mat.colorNode = baseColor as ReturnType<typeof vec3>;
    } else if (Array.isArray(baseColor) && baseColor.length >= 3) {
      mat.color.setRGB(baseColor[0], baseColor[1], baseColor[2]);
    }
  } else {
    // Default gray
    mat.color.setRGB(0.5, 0.5, 0.5);
  }

  // ---- Roughness ----
  const roughnessInput: any = bsdf?.roughness;
  if (roughnessInput?._isSwizzled) {
    const tex = texFromGraph(roughnessInput.source?.imageName);
    const node = resolveTSLNode(roughnessInput, tex);
    if (node) (mat as any).roughnessNode = node;
  } else if (roughnessInput?._isTSLTexture) {
    const tex = texFromGraph(roughnessInput.imageName);
    if (tex) (mat as any).roughnessNode = tslTexture(tex, tslUV());
  } else if (typeof roughnessInput === "number") {
    mat.roughness = roughnessInput;
  } else {
    mat.roughness = 0.5;
  }

  // ---- Metallic ----
  const metallicInput: any = bsdf?.metallic;
  if (metallicInput?._isSwizzled) {
    const tex = texFromGraph(metallicInput.source?.imageName);
    const node = resolveTSLNode(metallicInput, tex);
    if (node) (mat as any).metalnessNode = node;
  } else if (metallicInput?._isTSLTexture) {
    const tex = texFromGraph(metallicInput.imageName);
    if (tex) (mat as any).metalnessNode = tslTexture(tex, tslUV());
  } else if (typeof metallicInput === "number") {
    mat.metalness = metallicInput;
  } else {
    mat.metalness = 0.0;
  }

  // ---- Emission ----
  const emissionColor: any = bsdf?.emissionColor;
  const emissionStrength: any = bsdf?.emissionStrength;
  if (emissionColor?._isTSLTexture) {
    const tex = texFromGraph(emissionColor.imageName);
    if (tex) (mat as any).emissiveNode = tslTexture(tex, tslUV());
  }
  if (typeof emissionStrength === "number" && emissionStrength > 0) {
    mat.emissiveIntensity = emissionStrength;
  }

  // ---- Alpha / transparency ----
  const alphaInput: any = bsdf?.alpha;
  if (typeof alphaInput === "number") {
    if (alphaInput < 1.0) {
      mat.transparent = true;
      mat.opacity = alphaInput;
    }
  }

  // ---- Normal map (from graph Normal input) ----
  const normalInput: any = bsdf?.normal;
  if (normalInput?.type === "normalMap" && typeof normalInput.color === "string") {
    const tex = texFromGraph(normalInput.color);
    if (tex) mat.normalMap = tex;
  }

  // ---- Physical properties (scalars from graph) ----
  const wireScalar = (input: any, prop: keyof THREE.MeshPhysicalNodeMaterial, fallback: number) => {
    if (typeof input === "number") (mat as any)[prop] = input;
    else (mat as any)[prop] = fallback;
  };

  wireScalar(bsdf?.transmission, "transmission", 0);
  wireScalar(bsdf?.ior, "ior", 1.5);
  wireScalar(bsdf?.clearcoat, "clearcoat", 0);
  wireScalar(bsdf?.clearcoatRoughness, "clearcoatRoughness", 0);
  wireScalar(bsdf?.sheen, "sheen", 0);
  wireScalar(bsdf?.sheenRoughness, "sheenRoughness", 0);
  wireScalar(bsdf?.specular, "specularIntensity", 0);
  wireScalar(bsdf?.anisotropic, "anisotropy", 0);

  // Physical texture nodes
  const wireMap = (input: any, nodeProp: string) => {
    if (input?._isTSLTexture) {
      const tex = texFromGraph(input.imageName);
      if (tex) (mat as any)[nodeProp] = tslTexture(tex, tslUV());
    } else if (input?._isSwizzled) {
      const tex = texFromGraph(input.source?.imageName);
      const node = resolveTSLNode(input, tex);
      if (node) (mat as any)[nodeProp] = node;
    }
  };

  if (bsdf) {
    wireMap(bsdf.transmission, "transmissionNode");
    wireMap(bsdf.clearcoat, "clearcoatNode");
    wireMap(bsdf.clearcoatRoughness, "clearcoatRoughnessNode");
    wireMap(bsdf.sheen, "sheenNode");
    wireMap(bsdf.sheenRoughness, "sheenRoughnessNode");
    wireMap(bsdf.sheenTint, "sheenColorNode");
    wireMap(bsdf.specular, "specularIntensityNode");
    wireMap(bsdf.specularTint, "specularColorNode");
    wireMap(bsdf.anisotropic, "anisotropyNode");
    wireMap(bsdf.transmissionRoughness, "thicknessNode");
  }

  return mat;
}
