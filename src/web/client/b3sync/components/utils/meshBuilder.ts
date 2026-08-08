import * as THREE from "three/webgpu";
import type {
  TextureData,
  GeoBuffer,
  BlenderObject,
} from "../types/blenderTypes";
import { buildTSLMaterial, type ShaderGraph } from "./tslMaterialBuilder";

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------

/** Cached geometries, keyed by GeoBuffer version. */
export const _geometryCache = new Map<string, THREE.BufferGeometry>();

/** Cached materials, keyed by material fingerprint. */
export const _materialCache = new Map<string, THREE.MeshPhysicalNodeMaterial>();

/** Three.js Textures built from encoded image data via TextureLoader, keyed by `name:kind`. */
const _textureCache = new Map<string, THREE.Texture>();

export type TexKind = "color" | "noncolor";

export function getOrCreateTexture(
  name: string,
  texData: Map<string, TextureData>,
  kind: TexKind,
): THREE.Texture | null {
  const cacheKey = `${name}:${kind}`;
  const existing = _textureCache.get(cacheKey);
  if (existing) return existing;

  const texEntry = texData.get(name);
  if (!texEntry) return null;

  // Create a Blob URL from the encoded image bytes so the browser's native
  // PNG / JPEG / WebP decoder handles the sRGB → linear conversion correctly.
  const blob = new File([texEntry.bytes], "image.png", { type: texEntry.mime });
  const url = URL.createObjectURL(blob);
  const texture = new THREE.TextureLoader().load(url);

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.flipY = true;
  texture.colorSpace =
    kind === "color" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;

  _textureCache.set(cacheKey, texture);
  return texture;
}

// ---------------------------------------------------------------------------
// Geometry builder
// ---------------------------------------------------------------------------

/**
 * Build a BufferGeometry from a GeoBuffer binary blob.
 * Uses the typed arrays directly — no Float32Array conversion needed.
 * Cached by `buf.version` (which encodes vertex/face/UV counts).
 */
export function buildGeometry(
  buf: GeoBuffer,
  hasNormalMap: boolean,
): THREE.BufferGeometry {
  const key = buf.version;
  const cached = _geometryCache.get(key);
  if (cached) return cached;

  const geo = new THREE.BufferGeometry();

  // Vertices — already a Float32Array from the binary blob
  geo.setAttribute("position", new THREE.BufferAttribute(buf.vertices, 3));

  // Indices — use BufferAttribute to preserve uint32 precision
  geo.setIndex(new THREE.BufferAttribute(buf.indices, 1));

  // UVs — already a Float32Array
  if (buf.uvs && buf.uvs.length > 0) {
    geo.setAttribute("uv", new THREE.BufferAttribute(buf.uvs, 2));
  }

  geo.computeVertexNormals();

  if (hasNormalMap) {
    geo.computeTangents();
  }

  _geometryCache.set(key, geo);
  return geo;
}

// ---------------------------------------------------------------------------
// Material builder
// ---------------------------------------------------------------------------

/** Parameters for {@link buildMaterial}. */
export interface BuildMaterialParams {
  color: [number, number, number];
  roughness: number;
  metalness: number;
  emissiveColor: [number, number, number];
  emissiveIntensity: number;
  map: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  metalnessMap: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  flatShading?: boolean;
  graph?: ShaderGraph;
  // Physical material properties
  transmission?: number;
  transmissionMap?: THREE.Texture | null;
  thickness?: number;
  thicknessMap?: THREE.Texture | null;
  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  clearcoatMap?: THREE.Texture | null;
  clearcoatRoughnessMap?: THREE.Texture | null;
  clearcoatNormalMap?: THREE.Texture | null;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: [number, number, number];
  sheenColorMap?: THREE.Texture | null;
  sheenRoughnessMap?: THREE.Texture | null;
  specularIntensity?: number;
  specularColor?: [number, number, number];
  specularColorMap?: THREE.Texture | null;
  specularIntensityMap?: THREE.Texture | null;
  iridescence?: number;
  iridescenceMap?: THREE.Texture | null;
  iridescenceIOR?: number;
  iridescenceThicknessRange?: [number, number];
  iridescenceThicknessMap?: THREE.Texture | null;
  anisotropy?: number;
  anisotropyMap?: THREE.Texture | null;
  attenuationDistance?: number;
  attenuationColor?: [number, number, number];
}

/** Compute a cache key that uniquely identifies a material configuration. */
export function computeMaterialCacheKey(params: BuildMaterialParams): string {
  const parts = [
    params.color.join(","),
    params.roughness.toFixed(4),
    params.metalness.toFixed(4),
    params.emissiveColor.join(","),
    params.emissiveIntensity.toFixed(4),
    params.map?.uuid ?? "n",
    params.roughnessMap?.uuid ?? "n",
    params.metalnessMap?.uuid ?? "n",
    params.normalMap?.uuid ?? "n",
    params.emissiveMap?.uuid ?? "n",
    params.transparent ? "1" : "0",
    (params.opacity ?? 1).toFixed(4),
    (params.alphaTest ?? 0).toFixed(4),
    params.flatShading ? "1" : "0",
    params.graph ? "g" : "n",
    // Physical properties
    (params.transmission ?? 0).toFixed(4),
    params.transmissionMap?.uuid ?? "n",
    (params.thickness ?? 0).toFixed(4),
    params.thicknessMap?.uuid ?? "n",
    (params.ior ?? 1.5).toFixed(4),
    (params.clearcoat ?? 0).toFixed(4),
    (params.clearcoatRoughness ?? 0).toFixed(4),
    params.clearcoatMap?.uuid ?? "n",
    params.clearcoatRoughnessMap?.uuid ?? "n",
    params.clearcoatNormalMap?.uuid ?? "n",
    (params.sheen ?? 0).toFixed(4),
    (params.sheenRoughness ?? 0).toFixed(4),
    (params.sheenColor ?? [1, 1, 1]).join(","),
    params.sheenColorMap?.uuid ?? "n",
    params.sheenRoughnessMap?.uuid ?? "n",
    (params.specularIntensity ?? 0).toFixed(4),
    (params.specularColor ?? [1, 1, 1]).join(","),
    params.specularColorMap?.uuid ?? "n",
    params.specularIntensityMap?.uuid ?? "n",
    (params.iridescence ?? 0).toFixed(4),
    params.iridescenceMap?.uuid ?? "n",
    (params.iridescenceIOR ?? 1.3).toFixed(4),
    (params.iridescenceThicknessRange ?? [100, 400]).join(","),
    params.iridescenceThicknessMap?.uuid ?? "n",
    (params.anisotropy ?? 0).toFixed(4),
    params.anisotropyMap?.uuid ?? "n",
    (params.attenuationDistance ?? Infinity).toFixed(4),
    (params.attenuationColor ?? [1, 1, 1]).join(","),
  ];
  return parts.join("|");
}

/**
 * Build a MeshPhysicalNodeMaterial from material parameters.
 * Cached by material fingerprint (independent of geometry).
 */
export function buildMaterial(
  params: BuildMaterialParams,
): THREE.MeshPhysicalNodeMaterial {
  const key = computeMaterialCacheKey(params);
  const cached = _materialCache.get(key);
  if (cached) return cached;

  const mat = buildTSLMaterial({
    geometry: new THREE.BufferGeometry(), // not used by material builder
    graph: params.graph,
    color: params.color,
    roughness: params.roughness,
    metalness: params.metalness,
    emissiveColor: params.emissiveColor,
    emissiveIntensity: params.emissiveIntensity,
    map: params.map,
    roughnessMap: params.roughnessMap,
    metalnessMap: params.metalnessMap,
    normalMap: params.normalMap,
    emissiveMap: params.emissiveMap ?? null,
    transparent: params.transparent ?? false,
    opacity: params.opacity ?? 1,
    alphaTest: params.alphaTest ?? 0,
    flatShading: params.flatShading ?? false,
    // Physical properties
    transmission: params.transmission ?? 0,
    transmissionMap: params.transmissionMap ?? null,
    thickness: params.thickness ?? 0,
    thicknessMap: params.thicknessMap ?? null,
    ior: params.ior ?? 1.5,
    clearcoat: params.clearcoat ?? 0,
    clearcoatRoughness: params.clearcoatRoughness ?? 0,
    clearcoatMap: params.clearcoatMap ?? null,
    clearcoatRoughnessMap: params.clearcoatRoughnessMap ?? null,
    clearcoatNormalMap: params.clearcoatNormalMap ?? null,
    sheen: params.sheen ?? 0,
    sheenRoughness: params.sheenRoughness ?? 0,
    sheenColor: params.sheenColor ?? [1, 1, 1],
    sheenColorMap: params.sheenColorMap ?? null,
    sheenRoughnessMap: params.sheenRoughnessMap ?? null,
    specularIntensity: params.specularIntensity ?? 0,
    specularColor: params.specularColor ?? [1, 1, 1],
    specularColorMap: params.specularColorMap ?? null,
    specularIntensityMap: params.specularIntensityMap ?? null,
    iridescence: params.iridescence ?? 0,
    iridescenceMap: params.iridescenceMap ?? null,
    iridescenceIOR: params.iridescenceIOR ?? 1.3,
    iridescenceThicknessRange: params.iridescenceThicknessRange ?? [100, 400],
    iridescenceThicknessMap: params.iridescenceThicknessMap ?? null,
    anisotropy: params.anisotropy ?? 0,
    anisotropyMap: params.anisotropyMap ?? null,
    attenuationDistance: params.attenuationDistance ?? Infinity,
    attenuationColor: params.attenuationColor ?? [1, 1, 1],
  });

  _materialCache.set(key, mat);
  return mat;
}

// ---------------------------------------------------------------------------
// Cache-key helpers
// ---------------------------------------------------------------------------

/** Build a cache key that uniquely identifies a geometry+material combination. */
export function computeMeshCacheKey(
  objName: string,
  objVersion: string,
  geoVersion: string | undefined,
  map: THREE.Texture | null,
  roughnessMap: THREE.Texture | null,
  metalnessMap: THREE.Texture | null,
  normalMap: THREE.Texture | null,
  emissiveMap: THREE.Texture | null,
): string {
  return `${objName}@${objVersion}@${map?.uuid ?? "n"}@${metalnessMap?.uuid ?? "n"}@${normalMap?.uuid ?? "n"}@${roughnessMap?.uuid ?? "n"}@${emissiveMap?.uuid ?? "n"}@${geoVersion ?? "n"}`;
}

/** A managed InstancedMesh group. */
export interface InstancedGroupEntry {
  mesh: THREE.InstancedMesh;
  names: Set<string>;
}

// ---------------------------------------------------------------------------
// Matrix helpers
// ---------------------------------------------------------------------------

/**
 * Compose a world matrix from position / quaternion / scale arrays (Blender convention).
 * Used for setting per-instance matrices on InstancedMesh.
 */
export function composeMatrix(
  pos: [number, number, number],
  quat: [number, number, number, number],
  scl: [number, number, number],
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]),
    new THREE.Vector3(scl[0], scl[1], scl[2]),
  );
}
