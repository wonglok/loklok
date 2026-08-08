// ---------------------------------------------------------------------------
// Project Storage — OPFS save / load operations
// ---------------------------------------------------------------------------
// High-level persistence layer.  Reads from `blenderStore` for saves and
// populates it on load.  Geometry binaries use the same packed layout as the
// Blender plugin: [float32 vertices][uint32 indices][float32 UVs?]
// ---------------------------------------------------------------------------

import type { GeoBuffer, ImageData, TextureData } from "../types/blenderTypes";
import { useBlenderStore } from "../stores/blenderStore";
import {
  getProjectRoot,
  getDir,
  removeDir,
  readTextFile,
  readBinaryFile,
  writeTextFile,
  writeBinaryFile,
} from "../utils/workspaceStorage";
import { convertToWebP } from "../utils/imageConversion";
import type {
  GeoManifestEntry,
  LoadedProjectData,
  ProjectManifest,
  ProjectSaveData,
  TextureManifestEntry,
} from "./ProjectSaveData";
import { SAVE_SCHEMA_VERSION } from "./ProjectSaveData";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const LATEST = "latest-version";
const GEO_DIR = "geo";
const TEX_DIR = "tex";
const SCENE_FILE = "scene.json";
const MANIFEST_FILE = "manifest.json";
const HDR_FILE = "hdr.bin";

// ---------------------------------------------------------------------------
// Serialize / deserialize geometry binary
// ---------------------------------------------------------------------------

/** Pack a GeoBuffer into the same binary layout used by the Blender plugin. */
function packGeoBuffer(buf: GeoBuffer): ArrayBuffer {
  const vBytes = buf.vertices.byteLength;
  const iBytes = buf.indices.byteLength;
  const uBytes = buf.uvs ? buf.uvs.byteLength : 0;
  const total = vBytes + iBytes + uBytes;

  const packed = new Uint8Array(total);
  packed.set(
    new Uint8Array(buf.vertices.buffer, buf.vertices.byteOffset, vBytes),
    0,
  );
  packed.set(
    new Uint8Array(buf.indices.buffer, buf.indices.byteOffset, iBytes),
    vBytes,
  );
  if (buf.uvs && uBytes > 0) {
    packed.set(
      new Uint8Array(buf.uvs.buffer, buf.uvs.byteOffset, uBytes),
      vBytes + iBytes,
    );
  }
  return packed.buffer;
}

/** Unpack a binary blob back into a GeoBuffer. */
function unpackGeoBuffer(
  data: ArrayBuffer,
  vCount: number,
  iCount: number,
  hasUVs: boolean,
): GeoBuffer {
  const vBytes = vCount * 3 * 4;
  const iBytes = iCount * 4;

  const vertices = new Float32Array(data, 0, vCount * 3);
  const indices = new Uint32Array(data, vBytes, iCount);

  let uvs: Float32Array | undefined;
  if (hasUVs) {
    uvs = new Float32Array(data, vBytes + iBytes, vCount * 2);
  }

  return { version: "", vertices, indices, uvs };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export interface SaveProgress {
  phase: "geo" | "tex" | "manifest";
  current: number;
  total: number;
}

export async function saveProject(
  projectID: string,
  onProgress?: (p: SaveProgress) => void,
): Promise<void> {
  const root = await getProjectRoot(projectID);
  if (!root) throw new Error("OPFS not available");

  // Read current state from the blender store
  const store = useBlenderStore.getState();
  const {
    sceneData,
    lights,
    cameras,
    hdrData,
    hdrIntensity,
    geoBuffers,
    texData,
  } = store;

  // Remove previous latest-version so we write a fresh one
  await removeDir(root, LATEST);

  // Create fresh latest-version directory
  const dest = await root.getDirectoryHandle(LATEST, { create: true });

  // 1. Serialize geometry — each buffer gets its own binary file
  const geoDir = await dest.getDirectoryHandle(GEO_DIR, { create: true });
  const geoFiles: GeoManifestEntry[] = [];
  const totalGeo = geoBuffers.size;

  let idx = 0;
  for (const [name, buf] of geoBuffers) {
    const fileName = `${sanitiseFileName(name)}.bin`;
    const packed = packGeoBuffer(buf);
    await writeBinaryFile(geoDir, fileName, packed);
    geoFiles.push({
      file: fileName,
      objectName: name,
      vCount: buf.vertices.length / 3,
      iCount: buf.indices.length,
      hasUVs: !!(buf.uvs && buf.uvs.length > 0),
      version: buf.version,
    });
    idx++;
    onProgress?.({ phase: "geo", current: idx, total: totalGeo });
  }

  // 2. Serialize textures
  const texDir = await dest.getDirectoryHandle(TEX_DIR, { create: true });
  const texFiles: TextureManifestEntry[] = [];
  const totalTex = texData.size;

  idx = 0;
  for (const [name, tex] of texData) {
    const safeName = sanitiseFileName(name);
    const binFile = `${safeName}.bin`;
    const metaFile = `${safeName}.meta.json`;

    // Convert to WebP for smaller OPFS footprint (already-WebP images pass through)
    const { bytes: converted, mime: convertedMime } = await convertToWebP(
      tex.bytes,
      tex.mime,
    );

    await writeBinaryFile(texDir, binFile, converted);
    await writeTextFile(
      texDir,
      metaFile,
      JSON.stringify({ mime: convertedMime }),
    );

    texFiles.push({ name, binFile, metaFile, mime: convertedMime });
    idx++;
    onProgress?.({ phase: "tex", current: idx, total: totalTex });
  }

  // 3. Write HDR
  if (hdrData && hdrData.width > 0 && hdrData.height > 0) {
    await writeBinaryFile(dest, HDR_FILE, hdrData.pixels);
  }

  // 4. Write scene.json
  const saveData: ProjectSaveData = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    projectID,
    savedAt: new Date().toISOString(),
    objects: sceneData.objects,
    lights,
    cameras,
    hdrWidth: hdrData?.width ?? null,
    hdrHeight: hdrData?.height ?? null,
    hdrIntensity,
  };
  await writeTextFile(dest, SCENE_FILE, JSON.stringify(saveData));

  // 5. Write manifest.json
  const manifest: ProjectManifest = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    geoFiles,
    texFiles,
  };
  await writeTextFile(dest, MANIFEST_FILE, JSON.stringify(manifest));

  onProgress?.({ phase: "manifest", current: 1, total: 1 });
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export interface LoadProgress {
  phase: "scene" | "geo" | "tex" | "hdr";
  current: number;
  total: number;
}

export async function loadProject(
  projectID: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<LoadedProjectData | null> {
  const root = await getProjectRoot(projectID);
  if (!root) return null;

  const latestDir = await getDir(root, LATEST);
  if (!latestDir) return null;

  // 1. Read scene.json
  const sceneJson = await readTextFile(latestDir, SCENE_FILE);
  if (!sceneJson) return null;

  const saveData: ProjectSaveData = JSON.parse(sceneJson);
  onProgress?.({ phase: "scene", current: 1, total: 1 });

  // 2. Read manifest (for the file list)
  const manifestJson = await readTextFile(latestDir, MANIFEST_FILE);
  const manifest: ProjectManifest | null = manifestJson
    ? JSON.parse(manifestJson)
    : null;

  // 3. Read geometry buffers
  const geoDir = await getDir(latestDir, GEO_DIR);
  const geoBuffers = new Map<string, GeoBuffer>();

  if (manifest?.geoFiles && geoDir) {
    const total = manifest.geoFiles.length;
    for (let i = 0; i < total; i++) {
      const entry = manifest.geoFiles[i];
      const data = await readBinaryFile(geoDir, entry.file);
      if (!data) continue;

      const buf = unpackGeoBuffer(
        data,
        entry.vCount,
        entry.iCount,
        entry.hasUVs,
      );
      buf.version = entry.version;
      geoBuffers.set(entry.objectName, buf);

      onProgress?.({ phase: "geo", current: i + 1, total });
    }
  }

  // 4. Read textures
  const texDir = await getDir(latestDir, TEX_DIR);
  const texData = new Map<string, TextureData>();

  if (manifest?.texFiles && texDir) {
    const total = manifest.texFiles.length;
    for (let i = 0; i < total; i++) {
      const entry = manifest.texFiles[i];
      const bytes = await readBinaryFile(texDir, entry.binFile);
      if (!bytes) continue;
      texData.set(entry.name, { mime: entry.mime, bytes });
      onProgress?.({ phase: "tex", current: i + 1, total });
    }
  }

  // 5. Read HDR
  const hdrBytes = await readBinaryFile(latestDir, HDR_FILE);
  let hdrData: ImageData | null = null;
  if (hdrBytes && saveData.hdrWidth && saveData.hdrHeight) {
    hdrData = {
      width: saveData.hdrWidth,
      height: saveData.hdrHeight,
      pixels: hdrBytes,
    };
  }
  onProgress?.({ phase: "hdr", current: 1, total: 1 });

  return {
    sceneData: { objects: saveData.objects },
    lights: saveData.lights,
    cameras: saveData.cameras,
    hdrData,
    hdrIntensity: saveData.hdrIntensity,
    geoBuffers,
    texData,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitiseFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
