import type { ShaderGraph } from "../utils/tslMaterialBuilder";

// ---------------------------------------------------------------------------
// Shared types for the Blender ↔ Three.js sync pipeline.
// Moved here from useBlenderSync.ts so both the Zustand stores and consumers
// can import them without coupling to the sync hook.
// ---------------------------------------------------------------------------

export interface BlenderObject {
  name: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  color: [number, number, number];
  roughness?: number;
  metalness?: number;
  emissiveColor?: [number, number, number];
  emissiveIntensity?: number;
  texture?: string;
  roughnessMap?: string;
  metalnessMap?: string;
  normalMap?: string;
  emissiveMap?: string;
  /** True when Blender blend mode is BLEND or HASHED. */
  transparent?: boolean;
  /** Alpha value from the Principled BSDF (1.0 = fully opaque). */
  opacity?: number;
  /** Alpha-clip threshold from the material (0 when not using CLIP mode). */
  alphaTest?: number;
  /** True when all mesh faces are flat-shaded (Blender "Shade Flat"). */
  flatShading?: boolean;
  /** Serialised Blender shader node graph for TSL material reconstruction. */
  graph?: ShaderGraph;
  /** Geometry version — matched against GeoBuffer.version for cache invalidation. */
  version: string;
}

/** Binary geometry blob — sent once per version, stored in the store. */
export interface GeoBuffer {
  version: string;
  vertices: Float32Array;
  indices: Uint32Array;
  uvs?: Float32Array;
}

// ---------------------------------------------------------------------------
// Rig / Skeleton / Animation types
// ---------------------------------------------------------------------------

/** Per-track keyframe data for a single bone property. */
export interface KeyframeTrackData {
  boneIndex: number;
  /** 0 = position, 1 = quaternion, 2 = scale */
  property: number;
  times: Float32Array;
  values: Float32Array;
}

/** A single animation clip (action) with baked bone tracks. */
export interface AnimClipData {
  name: string;
  duration: number;
  tracks: KeyframeTrackData[];
}

/** Skeleton + skin + animation data for one rigged mesh. */
export interface RigBuffer {
  boneNames: string[];
  boneParents: Int32Array;
  /** Bind-pose local position per bone — 3 floats each, flat array. */
  boneBindPos: Float32Array;
  /** Bind-pose local quaternion per bone — 4 floats each, flat array. */
  boneBindQuat: Float32Array;
  /** Bind-pose local scale per bone — 3 floats each, flat array. */
  boneBindScl: Float32Array;
  /** vertexCount × 4 — up to 4 bone indices per vertex (0 = unused slot). */
  skinIndices: Uint16Array;
  /** vertexCount × 4 — corresponding weights, normalized to sum to 1. */
  skinWeights: Float32Array;
  /** Baked animation clips (empty array if no animation). */
  animClips: AnimClipData[];
}

export interface SceneData {
  objects: BlenderObject[];
}

export interface ImageData {
  width: number;
  height: number;
  /** Raw float32 RGBA pixel data */
  pixels: ArrayBuffer;
}

/** Encoded image data for material textures (PNG / JPG / WebP).
 *  TextureLoader handles sRGB encoding correctly with real image formats. */
export interface TextureData {
  /** MIME type of the encoded image bytes, e.g. "image/png" */
  mime: string;
  /** Encoded image file bytes */
  bytes: ArrayBuffer;
}

/** A single camera entry streamed from Blender at ~30 Hz when sync is enabled. */
export interface CameraData {
  name: string;
  /** Camera position in Three.js Y-up space (already converted from Blender Z-up). */
  position: [number, number, number];
  /** Quaternion rotation (x, y, z, w) in Three.js Y-up space. */
  quaternion: [number, number, number, number];
  /** Euler rotation (XYZ order) in Three.js Y-up space. */
  euler: [number, number, number];
  /** Scale, always [1, 1, 1] for viewport cameras. */
  scale: [number, number, number];
  fov: number;
  ortho: boolean;
  /** Blender camera.ortho_scale — size/zoom for orthographic cameras. */
  orthoScale?: number;
  /** Near clip plane (Blender camera.clip_start). */
  clipStart?: number;
  /** Far clip plane (Blender camera.clip_end). */
  clipEnd?: number;
  isActive?: boolean;
  isViewport?: boolean;
}

/** A single light entry synced from Blender. */
export interface LightData {
  name: string;
  /** Blender light type: 'POINT' | 'SUN' | 'SPOT' | 'AREA' */
  type: string;
  color: [number, number, number];
  intensity: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  /** POINT / SPOT: cutoff distance (0 = infinite). */
  distance?: number;
  /** POINT: shadow soft size / radius. */
  radius?: number;
  /** SUN: angular diameter in radians. */
  angle?: number;
  /** SPOT: cone angle in radians (spot_size). */
  coneAngle?: number;
  /** SPOT: blend/softness at cone edge (spot_blend). */
  penumbra?: number;
  /** AREA: width (size). */
  width?: number;
  /** AREA: height (size_y). */
  height?: number;
  /** AREA: shape — 'SQUARE' | 'RECTANGLE' | 'DISK' | 'ELLIPSE'. */
  shape?: string;
  /** Whether Blender's light.use_shadow is enabled. */
  castShadow?: boolean;
}

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";
