import type { ShaderGraph } from "../utils/tslMaterialBuilder";

// ---------------------------------------------------------------------------
// Shared types for the Blender ↔ Three.js sync pipeline.
// ---------------------------------------------------------------------------

export interface BlenderObject {
  name: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  /** Geometry version — matched against GeoBuffer.version for cache invalidation. */
  version: string;

  // ---- Flat material properties (always sent by Blender plugin) ----
  /** Base color (linear sRGB) — used when no shader graph or as graph fallback. */
  color: [number, number, number];
  roughness: number;
  metallic: number;
  emissiveColor: [number, number, number];
  emissiveIntensity: number;
  transparent: boolean;
  opacity: number;
  alphaTest: number;
  flatShading: boolean;
  /** Image texture name for base color map. */
  texture?: string;
  /** Image texture name for roughness map. */
  roughnessMap?: string;
  /** Image texture name for metalness map. */
  metalnessMap?: string;
  /** Image texture name for normal map. */
  normalMap?: string;
  /** Image texture name for emissive map. */
  emissiveMap?: string;

  /** Serialised Blender shader node graph — the primary source of material properties. */
  graph?: ShaderGraph;
}

/** Binary geometry blob — sent once per version, stored in the store. */
export interface GeoBuffer {
  version: string;
  vertices: Float32Array;
  indices: Uint32Array;
  uvs?: Float32Array;
}

export interface SceneData {
  objects: BlenderObject[];
}

export interface ImageData {
  width: number;
  height: number;
  /** Raw HDR file bytes (RGBE-encoded) — decoded by HDRLoader.parse() on the client. */
  bytes: ArrayBuffer;
}

/** Encoded image data for material textures (PNG / JPG / WebP). */
export interface TextureData {
  /** MIME type of the encoded image bytes, e.g. "image/png" */
  mime: string;
  /** Encoded image file bytes */
  bytes: ArrayBuffer;
}

/** A single camera entry streamed from Blender at ~15 Hz when sync is enabled. */
export interface CameraData {
  name: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  euler: [number, number, number];
  scale: [number, number, number];
  fov: number;
  ortho: boolean;
  orthoScale?: number;
  clipStart?: number;
  clipEnd?: number;
  isActive?: boolean;
  isViewport?: boolean;
}

/** A single light entry synced from Blender. */
export interface LightData {
  name: string;
  type: string;
  color: [number, number, number];
  intensity: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  distance?: number;
  radius?: number;
  angle?: number;
  coneAngle?: number;
  penumbra?: number;
  width?: number;
  height?: number;
  shape?: string;
  castShadow?: boolean;
}

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";
