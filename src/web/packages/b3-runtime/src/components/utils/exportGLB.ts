import { WebIO } from "@gltf-transform/core";
import { dedup, prune, instance, draco } from "@gltf-transform/functions";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptEncoder } from "meshoptimizer";
import draco3d from "draco3d";
import type { BlenderObject, GeoBuffer } from "../types/blenderTypes";
import { useBlenderStore } from "../stores/blenderStore";

// ---------------------------------------------------------------------------
// Browser-compatible draco encoder/decoder (wraps draco3d for gltf-transform)
// ---------------------------------------------------------------------------
const DRACO_WASM_URL = "/draco/";

async function createDracoEncoder(): Promise<any> {
  const mod = await (draco3d as any).createEncoderModule({
    locateFile: (path: string) => DRACO_WASM_URL + path,
  });
  return {
    encodeGeometry(mesh: any, _options?: any): Uint8Array {
      const encoder = new mod.Encoder();
      const meshBuilder = new mod.MeshBuilder();
      const newMesh = new mod.Mesh();

      const indices = mesh.indices.array;
      const numFaces = indices.length / 3;
      meshBuilder.AddFacesToMesh(newMesh, numFaces, new Uint32Array(indices));

      const attrMap: Record<string, number> = {
        POSITION: 3,
        NORMAL: 3,
        TEXCOORD_0: 2,
      };
      for (const [name, stride] of Object.entries(attrMap)) {
        const attr = mesh.attributes[name];
        if (!attr) continue;
        const dracoAttr = (mod as any)[name];
        if (dracoAttr === undefined) continue;
        meshBuilder.AddFloatAttributeToMesh(
          newMesh,
          dracoAttr,
          attr.array.length / stride,
          stride,
          new Float32Array(attr.array),
        );
      }

      encoder.SetSpeedOptions(4, 4);
      encoder.SetAttributeQuantization(mod.POSITION, 10);
      encoder.SetEncodingMethod(mod.MESH_EDGEBREAKER_ENCODING);

      const encodedData = new mod.DracoInt8Array();
      const encodedLen = encoder.EncodeMeshToDracoBuffer(newMesh, encodedData);
      const output = new Uint8Array(encodedLen);
      for (let i = 0; i < encodedLen; i++) output[i] = encodedData.GetValue(i);

      mod.destroy(encodedData);
      mod.destroy(newMesh);
      mod.destroy(encoder);
      mod.destroy(meshBuilder);
      return output;
    },
  };
}

async function createDracoDecoder(): Promise<any> {
  const mod = await (draco3d as any).createDecoderModule({
    locateFile: (path: string) => DRACO_WASM_URL + path,
  });
  return {
    decodeGeometry(buffer: Uint8Array): any {
      const decoder = new mod.Decoder();
      const decoderBuffer = new mod.DecoderBuffer();
      decoderBuffer.Init(new Int8Array(buffer), buffer.byteLength);
      const geometryType = decoder.GetEncodedGeometryType(decoderBuffer);

      let mesh: any;
      if (geometryType === mod.TRIANGULAR_MESH) {
        mesh = new mod.Mesh();
        decoder.DecodeBufferToMesh(decoderBuffer, mesh);
      } else {
        mod.destroy(decoderBuffer);
        mod.destroy(decoder);
        throw new Error("Unsupported draco geometry type");
      }
      mod.destroy(decoderBuffer);

      // Extract indices
      const numFaces = mesh.num_faces();
      const numIndices = numFaces * 3;
      const indices = new Uint32Array(numIndices);
      const ia = new mod.DracoInt32Array();
      for (let i = 0; i < numFaces; i++) {
        decoder.GetFaceFromMesh(mesh, i, ia);
        indices[i * 3] = ia.GetValue(0);
        indices[i * 3 + 1] = ia.GetValue(1);
        indices[i * 3 + 2] = ia.GetValue(2);
      }
      mod.destroy(ia);

      // Extract attributes
      const attributes: Record<string, { array: Float32Array }> = {};
      const attrNames: [string, number][] = [
        ["POSITION", 3],
        ["NORMAL", 3],
        ["TEXCOORD_0", 2],
      ];
      for (const [name, stride] of attrNames) {
        const dracoAttr = (mod as any)[name];
        if (dracoAttr === undefined) continue;
        const attrId = decoder.GetAttributeId(mesh, dracoAttr);
        if (attrId < 0) continue;
        const attribute = decoder.GetAttribute(mesh, attrId);
        const numValues = mesh.num_points() * stride;
        const attrData = new mod.DracoFloat32Array();
        decoder.GetAttributeFloatForAllPoints(mesh, attribute, attrData);
        const array = new Float32Array(numValues);
        for (let i = 0; i < numValues; i++) array[i] = attrData.GetValue(i);
        attributes[name] = { array };
        mod.destroy(attrData);
      }

      mod.destroy(decoder);
      return { indices: { array: indices }, attributes };
    },
  };
}

// ---------------------------------------------------------------------------
// GLB binary constants
// ---------------------------------------------------------------------------
const GLB_MAGIC = 0x46546c67;
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
  out.fill(0x20, buf.byteLength);
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
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    const ux = vertices[b] - vertices[a],
      uy = vertices[b + 1] - vertices[a + 1],
      uz = vertices[b + 2] - vertices[a + 2];
    const vx = vertices[c] - vertices[a],
      vy = vertices[c + 1] - vertices[a + 1],
      vz = vertices[c + 2] - vertices[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let i = 0; i < vCount; i++) {
    const off = i * 3;
    const nx = normals[off],
      ny = normals[off + 1],
      nz = normals[off + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      normals[off] = nx / len;
      normals[off + 1] = ny / len;
      normals[off + 2] = nz / len;
    } else {
      normals[off] = 0;
      normals[off + 1] = 1;
      normals[off + 2] = 0;
    }
  }
  return normals;
}

// ---------------------------------------------------------------------------
// Raw GLB builder — embeds geometry + textures into a glTF 2.0 binary
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

function buildRawGLB(): Uint8Array | null {
  const { sceneData, geoBuffers, texData } = useBlenderStore.getState();
  const objects = sceneData.objects;

  // ------------------------------------------------------------------
  // Collect texture images first so we can append them after geometry
  // ------------------------------------------------------------------
  const textureNames = new Set<string>();
  for (const obj of objects) {
    if (obj.texture) textureNames.add(obj.texture);
    if (obj.roughnessMap) textureNames.add(obj.roughnessMap);
    if (obj.metalnessMap) textureNames.add(obj.metalnessMap);
    if (obj.normalMap) textureNames.add(obj.normalMap);
    if (obj.emissiveMap) textureNames.add(obj.emissiveMap);
  }

  // Map texture name → { mime, bytes, imageIndex } (order matters for glTF)
  const texEntries: { name: string; mime: string; bytes: Uint8Array }[] = [];
  const texIndexMap = new Map<string, number>();
  for (const name of textureNames) {
    const tex = texData.get(name);
    if (tex && tex.bytes.byteLength > 0) {
      texIndexMap.set(name, texEntries.length);
      texEntries.push({
        name,
        mime: tex.mime,
        bytes: new Uint8Array(tex.bytes),
      });
    }
  }

  // ------------------------------------------------------------------
  // Geometry primitives
  // ------------------------------------------------------------------
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
    const normBytes = new Uint8Array(
      norms.buffer,
      norms.byteOffset,
      norms.byteLength,
    );
    const idxBytes = new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength);
    const uvBytes = uvs
      ? new Uint8Array(uvs.buffer, uvs.byteOffset, uvs.byteLength)
      : undefined;

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
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
      uvByteOffset: uvBytes
        ? baseOffset + posBytes.byteLength + normBytes.byteLength
        : undefined,
      idxByteOffset:
        baseOffset +
        posBytes.byteLength +
        normBytes.byteLength +
        (uvBytes?.byteLength ?? 0),
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

  // Offset where texture images start in the binary buffer
  const geoEndOffset = binParts.reduce((sum, p) => sum + p.byteLength, 0);

  // Compute texture image byte offsets (appended after geometry)
  const texByteOffsets: number[] = [];
  let runningTexOffset = geoEndOffset;
  for (const entry of texEntries) {
    texByteOffsets.push(runningTexOffset);
    runningTexOffset += entry.bytes.byteLength;
  }

  for (const entry of texEntries) {
    binParts.push(entry.bytes);
  }

  // Build binary buffer
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
  const images: any[] = [];
  const samplers: any[] = [];
  const textures: any[] = [];
  const meshes: any[] = [];
  const nodes: any[] = [];
  const materials: any[] = [];
  const materialIndexMap = new Map<string, number>();

  // Default sampler
  samplers.push({
    magFilter: 9729,
    minFilter: 9987,
    wrapS: 10497,
    wrapT: 10497,
  });

  // Texture images → bufferViews + images + textures
  for (let i = 0; i < texEntries.length; i++) {
    const entry = texEntries[i];
    // bufferView for this image
    const bvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: texByteOffsets[i],
      byteLength: entry.bytes.byteLength,
    });
    // image
    images.push({ mimeType: entry.mime, bufferView: bvIdx });
    // texture
    textures.push({ sampler: 0, source: i });
  }

  function getTexIndex(texName: string | undefined): number | undefined {
    if (!texName) return undefined;
    const idx = texIndexMap.get(texName);
    return idx;
  }

  function getMatIndex(obj: BlenderObject): number {
    const key = [
      obj.color?.join(","),
      obj.roughness ?? 0.5,
      obj.metalness ?? 0,
      obj.opacity ?? 1,
      obj.texture ?? "",
      obj.roughnessMap ?? "",
      obj.metalnessMap ?? "",
      obj.normalMap ?? "",
    ].join("_");
    if (materialIndexMap.has(key)) return materialIndexMap.get(key)!;
    const idx = materials.length;

    const mat: any = {
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
      alphaMode: obj.transparent && (obj.opacity ?? 1) < 1 ? "BLEND" : "OPAQUE",
      doubleSided: false,
    };

    // Base color texture
    const baseTexIdx = getTexIndex(obj.texture);
    if (baseTexIdx !== undefined) {
      mat.pbrMetallicRoughness.baseColorTexture = { index: baseTexIdx };
      // Having a texture usually means white base color (texture supplies the color)
      mat.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, obj.opacity ?? 1.0];
    }

    // Metallic-roughness texture (packed: roughness in G, metallic in B)
    const mrTexIdx = getTexIndex(obj.roughnessMap ?? obj.metalnessMap);
    if (mrTexIdx !== undefined) {
      mat.pbrMetallicRoughness.metallicRoughnessTexture = { index: mrTexIdx };
    }

    // Normal map
    const normTexIdx = getTexIndex(obj.normalMap);
    if (normTexIdx !== undefined) {
      mat.normalTexture = { index: normTexIdx };
    }

    // Emissive
    if (obj.emissiveColor?.some((v) => v > 0) || obj.emissiveMap) {
      mat.emissiveFactor = obj.emissiveColor ?? [0, 0, 0];
    }
    const emTexIdx = getTexIndex(obj.emissiveMap);
    if (emTexIdx !== undefined) {
      mat.emissiveTexture = { index: emTexIdx };
    }

    materials.push(mat);
    materialIndexMap.set(key, idx);
    return idx;
  }

  for (const prim of prims) {
    const bvBase = bufferViews.length;

    // POSITION
    bufferViews.push({
      buffer: 0,
      byteOffset: prim.posByteOffset,
      byteLength: prim.posCount * 3 * 4,
      target: 34962,
    });
    accessors.push({
      bufferView: bvBase,
      componentType: 5126,
      count: prim.posCount,
      type: "VEC3",
      min: prim.posMin,
      max: prim.posMax,
    });

    // NORMAL
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

    // TEXCOORD_0
    let texAccessorIdx: number | undefined;
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
      texAccessorIdx = accessors.length - 1;
    }

    // INDEX
    const idxBvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: prim.idxByteOffset,
      byteLength: prim.idxCount * 4,
      target: 34963,
    });
    accessors.push({
      bufferView: idxBvIdx,
      componentType: 5125,
      count: prim.idxCount,
      type: "SCALAR",
    });

    const attributes: Record<string, number> = {
      POSITION: bvBase,
      NORMAL: bvBase + 1,
    };
    if (texAccessorIdx !== undefined) attributes.TEXCOORD_0 = texAccessorIdx;

    meshes.push({
      primitives: [
        {
          attributes,
          indices: accessors.length - 1,
          material: getMatIndex(prim.obj),
        },
      ],
    });
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
  if (materials.length > 0) gltf.materials = materials;
  if (textures.length > 0) {
    gltf.textures = textures;
    gltf.images = images;
    gltf.samplers = samplers;
  }

  // ------------------------------------------------------------------
  // Pack GLB
  // ------------------------------------------------------------------
  const jsonStr = JSON.stringify(gltf);
  const encoder = new TextEncoder();
  const jsonBytes = alignTo4(encoder.encode(jsonStr));

  const totalSize = 12 + 8 + jsonBytes.byteLength + 8 + bin.byteLength;
  const glb = new Uint8Array(totalSize);
  const view = new DataView(glb.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalSize, true);

  let off = 12;
  view.setUint32(off, jsonBytes.byteLength, true);
  view.setUint32(off + 4, CHUNK_JSON, true);
  glb.set(jsonBytes, off + 8);
  off += 8 + jsonBytes.byteLength;

  view.setUint32(off, bin.byteLength, true);
  view.setUint32(off + 4, CHUNK_BIN, true);
  glb.set(bin, off + 8);

  return glb;
}

// ---------------------------------------------------------------------------
// Optimized export
// ---------------------------------------------------------------------------
let _ready = false;

async function ensureReady(): Promise<void> {
  if (_ready) return;
  await MeshoptEncoder.ready;
  _ready = true;
}

export async function downloadGLB(): Promise<void> {
  const rawGlb = buildRawGLB();
  if (!rawGlb) {
    console.warn("[B3Sync] No geometry to export.");
    return;
  }

  try {
    await ensureReady();

    const io = new WebIO()
      .registerExtensions(KHRONOS_EXTENSIONS)
      .registerDependencies({
        "meshopt.encoder": MeshoptEncoder,
        "meshopt.decoder": MeshoptEncoder,
        "draco3d.encoder": await createDracoEncoder(),
        "draco3d.decoder": await createDracoDecoder(),
      });

    const doc = await io.readBinary(rawGlb);

    await doc.transform(
      dedup(),
      instance(),
      prune({ keepAttributes: false, keepLeaves: false }),
      draco(),
    );

    const optimized = await io.writeBinary(doc);

    const blob = new Blob([optimized as BlobPart], {
      type: "model/gltf-binary",
    });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = "scene.glb";
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[B3Sync] GLB export failed:", err);
  }
}
