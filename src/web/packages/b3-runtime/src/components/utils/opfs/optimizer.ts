// ---------------------------------------------------------------------------
// OPFS Optimizer — compress raw buffers/textures to WebP + Draco
// ---------------------------------------------------------------------------
// Reads from ./current-view/* and writes optimised assets to
// ./current-optimised-view/*.
//
// Optimisation pipeline:
//   1. Textures    → WebP re-encode (via OffscreenCanvas, universal support)
//   2. HDR         → KTX2 (GPU-native, full HDR via UASTC)
//   3. Geometry    → Draco-compressed .bin (via draco3d WASM)
//   4. Scene JSON  → Copy-through with updated references
// ---------------------------------------------------------------------------

import draco3d from "draco3d";
import { DataTexture, RGBAFormat, FloatType } from "three";
import { KTX2Exporter } from "three/addons/exporters/KTX2Exporter.js";

import type {
  HdrConfig,
  TextureEntry,
  GeometryEntry,
  GeometryConfig,
  OpfsCapabilities,
} from "./types";
import { opfs } from "./core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = path.split("/").filter(Boolean);
  let handle = root;
  for (const part of parts) {
    handle = await handle.getDirectoryHandle(part, { create: true });
  }
  return handle;
}

async function writeJSON(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: unknown,
): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(new TextEncoder().encode(JSON.stringify(data, null, 2)));
  await writable.close();
}

async function readJSON<T>(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<T | null> {
  try {
    const file = await dir.getFileHandle(name);
    const f = await file.getFile();
    return JSON.parse(await f.text()) as T;
  } catch {
    return null;
  }
}

async function writeBinary(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: ArrayBuffer,
): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
}

// ---------------------------------------------------------------------------
// WebP encode — via OffscreenCanvas (universal browser support)
// ---------------------------------------------------------------------------

interface WebPEncodeOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

const DEFAULT_WEBP_OPTIONS: WebPEncodeOptions = {
  quality: 0.82,
  maxWidth: 4096,
  maxHeight: 4096,
};

async function encodeWebP(
  source: ImageBitmap | Blob,
  options: WebPEncodeOptions = {},
): Promise<{ blob: Blob; mime: string }> {
  const {
    quality = 0.82,
    maxWidth = 4096,
    maxHeight = 4096,
  } = {
    ...DEFAULT_WEBP_OPTIONS,
    ...options,
  };

  let bitmap: ImageBitmap;
  if (source instanceof Blob) {
    bitmap = await createImageBitmap(source);
  } else {
    bitmap = source;
  }

  const { width, height } = computeScaledSize(
    bitmap.width,
    bitmap.height,
    maxWidth,
    maxHeight,
  );

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/webp", quality });
  return { blob, mime: "image/webp" };
}

function computeScaledSize(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  if (w <= maxW && h <= maxH) return { width: w, height: h };
  const scale = Math.min(maxW / w, maxH / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// ---------------------------------------------------------------------------
// HDR → KTX2 (GPU-native, full dynamic range via UASTC)
// ---------------------------------------------------------------------------

async function hdrToKTX2(
  pixels: ArrayBuffer,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const floats = new Float32Array(pixels);

  // DataTexture from the raw Float32 RGBA pixels — no tonemap needed
  const texture = new DataTexture(floats, width, height, RGBAFormat, FloatType);
  texture.needsUpdate = true;

  const exporter = new KTX2Exporter();
  const ktx2 = await exporter.parse(texture);

  texture.dispose();

  return ktx2;
}

// ---------------------------------------------------------------------------
// Draco geometry compression — via Three.js DRACOExporter
// ---------------------------------------------------------------------------

const DRACO_WASM_URL = "/draco/";

async function compressGeometryDraco(
  vertices: Float32Array,
  indices: Uint32Array,
  uvs?: Float32Array,
): Promise<ArrayBuffer> {
  // Create the draco encoder WASM module
  const mod = await (draco3d as any).createEncoderModule({
    locateFile: (path: string) => DRACO_WASM_URL + path,
  });

  const encoder = new mod.Encoder();
  const meshBuilder = new mod.MeshBuilder();
  const mesh = new mod.Mesh();

  // POSITION
  const numVertices = vertices.length / 3;
  meshBuilder.AddFloatAttributeToMesh(
    mesh,
    mod.POSITION,
    numVertices,
    3,
    vertices,
  );

  // TEXCOORD_0
  if (uvs) {
    meshBuilder.AddFloatAttributeToMesh(
      mesh,
      mod.TEXCOORD_0,
      uvs.length / 2,
      2,
      uvs,
    );
  }

  // Faces (indices)
  const numFaces = indices.length / 3;
  meshBuilder.AddFacesToMesh(mesh, numFaces, new Uint32Array(indices));

  // Configure encoder
  encoder.SetSpeedOptions(5, 5);
  encoder.SetAttributeQuantization(mod.POSITION, 11);
  if (uvs) {
    encoder.SetAttributeQuantization(mod.TEXCOORD_0, 10);
  }
  encoder.SetEncodingMethod(mod.MESH_EDGEBREAKER_ENCODING);

  // Encode
  const encodedData = new mod.DracoInt8Array();
  const encodedLen = encoder.EncodeMeshToDracoBuffer(mesh, encodedData);
  const output = new Int8Array(encodedLen);
  for (let i = 0; i < encodedLen; i++) {
    output[i] = encodedData.GetValue(i);
  }

  // Cleanup
  mod.destroy(encodedData);
  mod.destroy(mesh);
  mod.destroy(encoder);
  mod.destroy(meshBuilder);

  return output.buffer;
}

// ---------------------------------------------------------------------------
// Optimiser — orchestrates the full pipeline
// ---------------------------------------------------------------------------

export interface OptimiserProgress {
  stage: string;
  current: number;
  total: number;
}

export type OptimiserCallback = (progress: OptimiserProgress) => void;

export class OpfsOptimiser {
  private caps: OpfsCapabilities | null = null;

  async init(): Promise<OpfsCapabilities> {
    if (!this.caps) {
      const { detectCapabilities } = await import("./core");
      this.caps = await detectCapabilities();
    }
    return this.caps;
  }

  /**
   * Run the full optimisation pipeline:
   *   1. Textures → WebP
   *   2. HDR → KTX2 (UASTC, full HDR)
   *   3. Geometry → Draco
   *   4. Cameras, lights, scene JSON copy-through
   */
  async optimise(onProgress?: OptimiserCallback): Promise<void> {
    const root = await opfs["init"]();

    // -- Clear previous optimised output --
    await opfs.clearOptimisedView();
    const outRoot = await ensureDir(root, "current-optimised-view");

    // ---- Textures ----
    const texManifest = await (async () => {
      try {
        const d = await ensureDir(root, "current-view/textures");
        return await readJSON<TextureEntry[]>(d, "manifest.json");
      } catch {
        return null;
      }
    })();

    const texEntries = texManifest ?? [];
    if (texEntries.length > 0) {
      onProgress?.({ stage: "textures", current: 0, total: texEntries.length });

      const texOutDir = await ensureDir(outRoot, "textures");
      const texOutManifest: TextureEntry[] = [];

      for (let i = 0; i < texEntries.length; i++) {
        const entry = texEntries[i];
        onProgress?.({
          stage: "textures",
          current: i,
          total: texEntries.length,
        });

        try {
          const texData = await opfs.readTexture(entry.name);
          if (!texData) continue;

          const blob = new Blob([texData.bytes], { type: texData.mime });
          const { blob: webpBlob, mime } = await encodeWebP(blob);
          await writeBinary(
            texOutDir,
            `${entry.name}.webp`,
            await webpBlob.arrayBuffer(),
          );
          texOutManifest.push({ name: entry.name, mime });
        } catch (err) {
          console.warn(
            `[OPFS Optimiser] Texture "${entry.name}" skipped:`,
            err,
          );
        }
      }

      await writeJSON(texOutDir, "manifest.json", texOutManifest);
      onProgress?.({
        stage: "textures",
        current: texEntries.length,
        total: texEntries.length,
      });
    }

    // ---- HDR ----
    const hdrPixels = await opfs.readHDRBinary();
    const hdrConfig = await opfs.readHDRConfig();

    if (hdrPixels && hdrConfig) {
      onProgress?.({ stage: "hdr", current: 0, total: 1 });

      try {
        const hdrOutDir = await ensureDir(outRoot, "hdr");
        const ktx2 = await hdrToKTX2(
          hdrPixels,
          hdrConfig.width,
          hdrConfig.height,
        );
        await writeBinary(hdrOutDir, "data.ktx2", ktx2.buffer as ArrayBuffer);
        await writeJSON(hdrOutDir, "config.json", {
          ...hdrConfig,
          format: "image/ktx2",
          encoding: "uastc-hdr",
        });
      } catch (err) {
        console.warn("[OPFS Optimiser] HDR skipped:", err);
      }

      onProgress?.({ stage: "hdr", current: 1, total: 1 });
    }

    // ---- Geometry (Draco via Three.js DRACOExporter) ----
    const geoManifest = await (async () => {
      try {
        const d = await ensureDir(root, "current-view/geometry");
        return await readJSON<GeometryEntry[]>(d, "manifest.json");
      } catch {
        return null;
      }
    })();

    const geoEntries = geoManifest ?? [];
    if (geoEntries.length > 0) {
      onProgress?.({ stage: "geometry", current: 0, total: geoEntries.length });

      for (let i = 0; i < geoEntries.length; i++) {
        const entry = geoEntries[i];
        onProgress?.({
          stage: "geometry",
          current: i,
          total: geoEntries.length,
        });

        try {
          const geo = await opfs.readGeometry(entry.name);
          if (!geo) continue;

          const geoOutDir = await ensureDir(
            outRoot,
            `geometry/${sanitiseName(entry.name)}`,
          );

          try {
            const dracoBuf = await compressGeometryDraco(
              geo.vertices,
              geo.indices,
              geo.uvs,
            );
            await writeBinary(geoOutDir, "draco.bin", dracoBuf);
          } catch (err) {
            // Draco failed — copy raw as fallback
            console.warn(
              `[OPFS Optimiser] Draco failed for "${entry.name}", storing raw:`,
              err,
            );
            await writeBinary(
              geoOutDir,
              "vertices.bin",
              sliceBuffer(geo.vertices),
            );
            await writeBinary(
              geoOutDir,
              "indices.bin",
              sliceBuffer(geo.indices),
            );
            if (geo.uvs) {
              await writeBinary(geoOutDir, "uvs.bin", sliceBuffer(geo.uvs));
            }
          }

          const config: GeometryConfig = {
            version: geo.version,
            vCount: geo.vertices.length / 3,
            iCount: geo.indices.length,
            hasUVs: !!geo.uvs,
          };
          await writeJSON(geoOutDir, "config.json", config);
        } catch (err) {
          console.warn(
            `[OPFS Optimiser] Geometry "${entry.name}" skipped:`,
            err,
          );
        }
      }

      const geoOutManifestDir = await ensureDir(outRoot, "geometry");
      await writeJSON(geoOutManifestDir, "manifest.json", geoEntries);

      onProgress?.({
        stage: "geometry",
        current: geoEntries.length,
        total: geoEntries.length,
      });
    }

    // ---- Cameras, Lights, Scene (copy-through) ----
    onProgress?.({ stage: "meta", current: 0, total: 3 });

    const scene = await opfs.readScene();
    if (scene) {
      await writeJSON(outRoot, "scene.json", scene);
    }

    const cameras = await opfs.readCameras();
    if (cameras.length > 0) {
      await writeJSON(outRoot, "cameras.json", cameras);
    }
    onProgress?.({ stage: "meta", current: 1, total: 3 });

    const lights = await opfs.readLights();
    if (lights.length > 0) {
      await writeJSON(outRoot, "lights.json", lights);
    }
    onProgress?.({ stage: "meta", current: 3, total: 3 });

    onProgress?.({ stage: "done", current: 1, total: 1 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe slice of a TypedArray's underlying buffer. */
function sliceBuffer(arr: Float32Array | Uint32Array): ArrayBuffer {
  return arr.buffer.slice(
    arr.byteOffset,
    arr.byteOffset + arr.byteLength,
  ) as ArrayBuffer;
}

function sanitiseName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_");
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const opfsOptimiser = new OpfsOptimiser();
