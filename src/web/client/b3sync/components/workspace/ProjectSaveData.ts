// ---------------------------------------------------------------------------
// Project save data types
// ---------------------------------------------------------------------------
// Contracts for the serialized project format stored in OPFS.
// ---------------------------------------------------------------------------

import type {
  BlenderObject,
  CameraData,
  GeoBuffer,
  ImageData,
  LightData,
  SceneData,
  TextureData,
} from "../types/blenderTypes";

/** Schema version for forward-compatibility. */
export const SAVE_SCHEMA_VERSION = 1;

/** Top-level JSON manifest written as `scene.json`. */
export interface ProjectSaveData {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  projectID: string;
  savedAt: string; // ISO 8601

  objects: BlenderObject[];
  lights: LightData[];
  cameras: CameraData[];

  /** The .blend file path this project was synced from. */
  blenderFilePath: string | null;

  /** HDR env-map dimensions (null = no HDR). */
  hdrWidth: number | null;
  hdrHeight: number | null;
  hdrIntensity: number;
}

/** Fully loaded project data including all binary blobs. */
export interface LoadedProjectData {
  sceneData: SceneData;
  lights: LightData[];
  cameras: CameraData[];
  hdrData: ImageData | null;
  hdrIntensity: number;
  geoBuffers: Map<string, GeoBuffer>;
  texData: Map<string, TextureData>;
  blenderFilePath: string | null;
}

/** Per-geometry metadata stored in the manifest (needed for unpacking binary blobs). */
export interface GeoManifestEntry {
  /** Filename under `geo/`, e.g. "Cube.bin". */
  file: string;
  /** Original Blender object name (for matching to BlenderObject). */
  objectName: string;
  vCount: number;
  iCount: number;
  hasUVs: boolean;
  version: string;
}

/** Index file listing all geo/texture filenames — written as `manifest.json`. */
export interface ProjectManifest {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  /** List of geometry entries under `geo/`. */
  geoFiles: GeoManifestEntry[];
  /** List of texture entries under `tex/`. */
  texFiles: TextureManifestEntry[];
}

export interface TextureManifestEntry {
  /** Basename of the texture (same as the key in `texData` Map). */
  name: string;
  /** Filename for the binary blob, e.g. "wood.png.bin". */
  binFile: string;
  /** Filename for the metadata, e.g. "wood.png.meta.json". */
  metaFile: string;
  /** MIME type, e.g. "image/png". */
  mime: string;
}
