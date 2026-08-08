import * as THREE from "three/webgpu";
import type { GeoBuffer } from "../types/blenderTypes";
import type { TextureData } from "../types/blenderTypes";
import { buildTSLMaterial, type ShaderGraph } from "./tslMaterialBuilder";

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------

/** Cached geometries, keyed by GeoBuffer version. */
export const _geometryCache = new Map<string, THREE.BufferGeometry>();

/** Cached materials, keyed by serialised graph. */
export const _materialCache = new Map<string, THREE.MeshPhysicalNodeMaterial>();

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
// Material builder — graph is the sole source of material properties
// ---------------------------------------------------------------------------

/** Parameters for {@link buildMaterial}. Graph-derived, no flat properties. */
export interface BuildMaterialParams {
  graph?: ShaderGraph;
  texData: Map<string, TextureData>;
}

/** Compute a cache key from the serialised shader graph. */
export function computeMaterialCacheKey(params: BuildMaterialParams): string {
  if (params.graph) {
    return JSON.stringify(params.graph);
  }
  return "no-graph";
}

/**
 * Build a MeshPhysicalNodeMaterial purely from the Blender shader graph.
 * Cached by serialised graph (independent of geometry).
 */
export function buildMaterial(
  params: BuildMaterialParams,
): THREE.MeshPhysicalNodeMaterial {
  const key = computeMaterialCacheKey(params);
  const cached = _materialCache.get(key);
  if (cached) return cached;

  const mat = buildTSLMaterial({
    graph: params.graph,
    texData: params.texData,
  });

  _materialCache.set(key, mat);
  return mat;
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
