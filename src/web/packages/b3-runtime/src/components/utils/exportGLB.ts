import type { BlenderObject, GeoBuffer } from "../types/blenderTypes";
import { useBlenderStore } from "../stores/blenderStore";

// ---------------------------------------------------------------------------
// glTF 2.0 helpers
// ---------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function pad4(n: number): number {
  return (n + 3) & ~3;
}

function alignTo4(buf: Uint8Array): Uint8Array {
  const pad = pad4(buf.byteLength) - buf.byteLength;
  if (pad === 0) return buf;
  const out = new Uint8Array(buf.byteLength + pad);
  out.set(buf);
  out.fill(0x20, buf.byteLength); // space-pad JSON
  return out;
}

// ---------------------------------------------------------------------------
// Normal computation
// ---------------------------------------------------------------------------
function computeNormals(
  vertices: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const vCount = vertices.length / 3;
  const normals = new Float32Array(vCount * 3);

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;

    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2];
    const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2];
    const cx = vertices[c], cy = vertices[c + 1], cz = vertices[c + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }

  // Normalize
  for (let i = 0; i < vCount; i++) {
    const off = i * 3;
    const nx = normals[off], ny = normals[off + 1], nz = normals[off + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      normals[off] = nx / len;
      normals[off + 1] = ny / len;
      normals[off + 2] = nz / len;
    } else {
      normals[off] = 0; normals[off + 1] = 1; normals[off + 2] = 0;
    }
  }
  return normals;
}

// ---------------------------------------------------------------------------
// GLB builder
// ---------------------------------------------------------------------------
interface MeshPrim {
  obj: BlenderObject;
  geo: GeoBuffer;
  posByteOffset: number;
  normByteOffset: number;
  uvByteOffset?: number;
  idxByteOffset: number;
  posCount: number;
  normCount: number;
  uvCount: number;
  idxCount: number;
  posMin: [number, number, number];
  posMax: [number, number, number];
}

export function buildGLB(): Uint8Array | null {
  const { sceneData, geoBuffers } = useBlenderStore.getState();
  const objects = sceneData.objects;

  // Filter to meshes that have geometry buffers
  const prims: MeshPrim[] = [];
  const binParts: Uint8Array[] = [];

  for (const obj of objects) {
    const geo = geoBuffers.get(obj.name);
    if (!geo || geo.vertices.length === 0 || geo.indices.length === 0) continue;

    const pos = geo.vertices;
    const idx = geo.indices;
    const uvs = geo.uvs;
    const norms = computeNormals(pos, idx);

    const posBytes = new Uint8Array(pos.buffer, pos.byteOffset, pos.byteLength);
    const normBytes = new Uint8Array(norms.buffer, norms.byteOffset, norms.byteLength);
    const idxBytes = new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength);
    const uvBytes = uvs
      ? new Uint8Array(uvs.buffer, uvs.byteOffset, uvs.byteLength)
      : undefined;

    // Compute bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] < minX) minX = pos[i];
      if (pos[i + 1] < minY) minY = pos[i + 1];
      if (pos[i + 2] < minZ) minZ = pos[i + 2];
      if (pos[i] > maxX) maxX = pos[i];
      if (pos[i + 1] > maxY) maxY = pos[i + 1];
      if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
    }

    const baseOffset = binParts.reduce((sum, p) => sum + p.byteLength, 0);

    prims.push({
      obj,
      geo,
      posByteOffset: baseOffset,
      normByteOffset: baseOffset + posBytes.byteLength,
      uvByteOffset: uvBytes ? baseOffset + posBytes.byteLength + normBytes.byteLength : undefined,
      idxByteOffset: baseOffset + posBytes.byteLength + normBytes.byteLength + (uvBytes?.byteLength ?? 0),
      posCount: pos.length / 3,
      normCount: norms.length / 3,
      uvCount: uvs ? uvs.length / 2 : 0,
      idxCount: idx.length,
      posMin: [minX, minY, minZ],
      posMax: [maxX, maxY, maxZ],
    });

    binParts.push(posBytes, normBytes);
    if (uvBytes) binParts.push(uvBytes);
    binParts.push(idxBytes);
  }

  if (prims.length === 0) return null;

  // ------------------------------------------------------------------
  // Build binary buffer
  // ------------------------------------------------------------------
  const binLength = binParts.reduce((sum, p) => sum + p.byteLength, 0);
  const bin = new Uint8Array(binLength);
  let cursor = 0;
  for (const part of binParts) {
    bin.set(part, cursor);
    cursor += part.byteLength;
  }

  // ------------------------------------------------------------------
  // glTF JSON
  // ------------------------------------------------------------------
  const bufferViews: any[] = [];
  const accessors: any[] = [];
  const meshes: any[] = [];
  const nodes: any[] = [];
  const materials: any[] = [];
  const materialIndexMap = new Map<string, number>();

  function getMaterialIndex(obj: BlenderObject): number {
    const key = `${obj.color?.join(",")}_${obj.roughness ?? 0.5}_${obj.metalness ?? 0}_${obj.opacity ?? 1}`;
    if (materialIndexMap.has(key)) return materialIndexMap.get(key)!;
    const idx = materials.length;
    materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: [
          obj.color?.[0] ?? 0.5,
          obj.color?.[1] ?? 0.5,
          obj.color?.[2] ?? 0.5,
          obj.opacity ?? 1.0,
        ],
        metallicFactor: obj.metalness ?? 0,
        roughnessFactor: obj.roughness ?? 0.5,
      },
      alphaMode: (obj.transparent && (obj.opacity ?? 1) < 1) ? "BLEND" : "OPAQUE",
      doubleSided: false,
    });
    materialIndexMap.set(key, idx);
    return idx;
  }

  for (const prim of prims) {
    const bvBase = bufferViews.length;

    // POSITION bufferView + accessor
    bufferViews.push({
      buffer: 0,
      byteOffset: prim.posByteOffset,
      byteLength: prim.posCount * 3 * 4,
      target: 34962, // ARRAY_BUFFER
    });
    accessors.push({
      bufferView: bvBase,
      componentType: 5126, // FLOAT
      count: prim.posCount,
      type: "VEC3",
      min: prim.posMin,
      max: prim.posMax,
    });

    // NORMAL bufferView + accessor
    bufferViews.push({
      buffer: 0,
      byteOffset: prim.normByteOffset,
      byteLength: prim.normCount * 3 * 4,
      target: 34962,
    });
    accessors.push({
      bufferView: bvBase + 1,
      componentType: 5126,
      count: prim.normCount,
      type: "VEC3",
    });

    // TEXCOORD_0 bufferView + accessor (optional)
    let texCoordAccessorIdx: number | undefined;
    if (prim.uvByteOffset !== undefined && prim.uvCount > 0) {
      bufferViews.push({
        buffer: 0,
        byteOffset: prim.uvByteOffset,
        byteLength: prim.uvCount * 2 * 4,
        target: 34962,
      });
      accessors.push({
        bufferView: bvBase + 2,
        componentType: 5126,
        count: prim.uvCount,
        type: "VEC2",
      });
      texCoordAccessorIdx = accessors.length - 1;
    }

    // INDEX bufferView + accessor
    const idxBvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: prim.idxByteOffset,
      byteLength: prim.idxCount * 4,
      target: 34963, // ELEMENT_ARRAY_BUFFER
    });
    accessors.push({
      bufferView: idxBvIdx,
      componentType: 5125, // UNSIGNED_INT
      count: prim.idxCount,
      type: "SCALAR",
    });

    // Attributes
    const attributes: Record<string, number> = {
      POSITION: bvBase,
      NORMAL: bvBase + 1,
    };
    if (texCoordAccessorIdx !== undefined) {
      attributes.TEXCOORD_0 = texCoordAccessorIdx;
    }

    const matIdx = getMaterialIndex(prim.obj);

    meshes.push({
      primitives: [
        {
          attributes,
          indices: accessors.length - 1,
          material: matIdx,
        },
      ],
    });

    // Node
    nodes.push({
      name: prim.obj.name,
      mesh: meshes.length - 1,
      translation: prim.obj.position,
      rotation: prim.obj.quaternion,
      scale: prim.obj.scale,
    });
  }

  const gltf: any = {
    asset: { version: "2.0", generator: "B3Sync" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  };
  if (materials.length > 0) {
    gltf.materials = materials;
  }

  // ------------------------------------------------------------------
  // Pack GLB
  // ------------------------------------------------------------------
  const jsonStr = JSON.stringify(gltf);
  const encoder = new TextEncoder();
  const jsonBytes = alignTo4(encoder.encode(jsonStr));

  const headerSize = 12;
  const jsonChunkHeaderSize = 8;
  const binChunkHeaderSize = 8;
  const totalSize =
    headerSize + jsonChunkHeaderSize + jsonBytes.byteLength + binChunkHeaderSize + bin.byteLength;

  const glb = new Uint8Array(totalSize);
  const view = new DataView(glb.buffer);

  // Header
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalSize, true);

  // JSON chunk
  let off = 12;
  view.setUint32(off, jsonBytes.byteLength, true);       // chunkLength
  view.setUint32(off + 4, CHUNK_JSON, true);              // chunkType
  glb.set(jsonBytes, off + 8);
  off += 8 + jsonBytes.byteLength;

  // BIN chunk
  view.setUint32(off, bin.byteLength, true);
  view.setUint32(off + 4, CHUNK_BIN, true);
  glb.set(bin, off + 8);

  return glb;
}

// ---------------------------------------------------------------------------
// Download trigger
// ---------------------------------------------------------------------------
export function downloadGLB(): void {
  const glb = buildGLB();
  if (!glb) {
    console.warn("[B3Sync] No geometry to export — only meshes with synced geo buffers are included.");
    return;
  }

  const blob = new Blob([glb as BlobPart], { type: "model/gltf-binary" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "scene.glb";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
