"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/Addons.js";
import JSZip from "jszip";
import draco3d from "draco3d";

import type { SceneData, CameraData, LightData } from "../types/blenderTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoadedObject {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

interface ProductionScene {
  objects: LoadedObject[];
  lights: LightData[];
  cameras: CameraData[];
  /** Radiance RGBE HDR buffer — decoded via HDRLoader inside Canvas. */
  hdrBytes: ArrayBuffer | null;
  hdrIntensity: number;
}

// ---------------------------------------------------------------------------
// Draco decoder (mirrors the encoder in optimizer.ts)
// ---------------------------------------------------------------------------

const DRACO_WASM_URL = "/draco/";

async function decodeDraco(
  buffer: ArrayBuffer,
  objectName: string,
): Promise<{
  vertices: Float32Array;
  indices: Uint32Array;
  uvs?: Float32Array;
}> {
  // Ensure we have an exact-size buffer (no slack bytes from the zip extraction)
  const bytes = new Uint8Array(buffer);

  const mod = await (draco3d as any).createDecoderModule({
    locateFile: (path: string) => DRACO_WASM_URL + path,
  });

  const decoder = new mod.Decoder();
  const decoderBuffer = new mod.DecoderBuffer();
  decoderBuffer.Init(
    new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    bytes.byteLength,
  );

  const geometryType = decoder.GetEncodedGeometryType(decoderBuffer);
  if (geometryType !== mod.TRIANGULAR_MESH) {
    mod.destroy(decoderBuffer);
    mod.destroy(decoder);
    if (geometryType === -1) {
      throw new Error(`Draco: invalid or corrupt data for "${objectName}"`);
    }
    throw new Error(
      `Draco: unexpected geometry type ${geometryType} for "${objectName}"`,
    );
  }

  const mesh = new mod.Mesh();
  const status = decoder.DecodeBufferToMesh(decoderBuffer, mesh);
  mod.destroy(decoderBuffer);

  if (!status.ok || mesh.num_faces() === 0) {
    mod.destroy(mesh);
    mod.destroy(decoder);
    throw new Error(
      `Draco: decode failed for "${objectName}" (${status.error_string?.() ?? "unknown"})`,
    );
  }

  // Indices
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

  // POSITION
  const posAttrId = decoder.GetAttributeId(mesh, mod.POSITION);
  if (posAttrId < 0) {
    mod.destroy(mesh);
    mod.destroy(decoder);
    throw new Error(`Draco: no POSITION attribute for "${objectName}"`);
  }

  const posAttr = decoder.GetAttribute(mesh, posAttrId);
  const numVertices = mesh.num_points();
  const vertices = new Float32Array(numVertices * 3);
  const posArray = new mod.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(mesh, posAttr, posArray);
  for (let i = 0; i < numVertices * 3; i++) vertices[i] = posArray.GetValue(i);
  mod.destroy(posArray);

  // TEX_COORD
  let uvs: Float32Array | undefined;
  const texAttrId = decoder.GetAttributeId(mesh, mod.TEX_COORD);
  if (texAttrId >= 0) {
    const texAttr = decoder.GetAttribute(mesh, texAttrId);
    const numUVs = mesh.num_points();
    uvs = new Float32Array(numUVs * 2);
    const uvArray = new mod.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, texAttr, uvArray);
    for (let i = 0; i < numUVs * 2; i++) uvs[i] = uvArray.GetValue(i);
    mod.destroy(uvArray);
  }

  mod.destroy(mesh);
  mod.destroy(decoder);

  return { vertices, indices, uvs };
}

// ---------------------------------------------------------------------------
// Scene loader (runs once per zip buffer)
// ---------------------------------------------------------------------------

async function loadProductionScene(
  zipBuffer: ArrayBuffer,
): Promise<ProductionScene> {
  const zip = await JSZip.loadAsync(zipBuffer);

  // Parse JSON files
  const sceneJson = zip.file("scene.json");
  const camerasJson = zip.file("cameras.json");
  const lightsJson = zip.file("lights.json");

  const sceneData: SceneData = sceneJson
    ? JSON.parse(await sceneJson.async("text"))
    : { objects: [] };
  const cameras: CameraData[] = camerasJson
    ? JSON.parse(await camerasJson.async("text"))
    : [];
  const lights: LightData[] = lightsJson
    ? JSON.parse(await lightsJson.async("text"))
    : [];

  // HDR environment (Radiance RGBE format — decoded via HDRLoader inside Canvas)
  let hdrBytes: ArrayBuffer | null = null;
  let hdrIntensity = 1.0;

  const hdrConfigFile = zip.file("hdr/config.json");
  if (hdrConfigFile) {
    const hdrConfig = JSON.parse(await hdrConfigFile.async("text"));
    hdrIntensity = hdrConfig.intensity ?? 1.0;
  }

  const hdrBinFile = zip.file("hdr/data.bin");
  if (hdrBinFile) {
    hdrBytes = await hdrBinFile.async("arraybuffer");
  }

  // Build objects
  const loadedObjects: LoadedObject[] = [];

  // Pre-load textures
  const texManifestFile = zip.file("textures/manifest.json");
  const texEntries: { name: string; mime: string }[] = texManifestFile
    ? JSON.parse(await texManifestFile.async("text"))
    : [];

  const textureMap = new Map<string, THREE.Texture>();
  const texLoader = new THREE.TextureLoader();

  for (const entry of texEntries) {
    const ext = entry.mime.split("/")[1] || "webp";
    const texFile = zip.file(`textures/${entry.name}.${ext}`);
    if (!texFile) continue;

    const bytes = await texFile.async("arraybuffer");
    const blob = new Blob([bytes], { type: entry.mime });
    const url = URL.createObjectURL(blob);

    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      texLoader.load(url, resolve, undefined, reject);
    });
    URL.revokeObjectURL(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    textureMap.set(entry.name, texture);
  }

  // Geometry manifest
  const geoManifestFile = zip.file("geometry/manifest.json");
  const geoEntries: { name: string }[] = geoManifestFile
    ? JSON.parse(await geoManifestFile.async("text"))
    : [];

  const geometryMap = new Map<string, THREE.BufferGeometry>();

  for (const entry of geoEntries) {
    try {
      const safeName = entry.name.replace(/[<>:"/\\|?*]/g, "_");

      // Try Draco first, fall back to raw
      const dracoFile = zip.file(`geometry/${safeName}/draco.bin`);
      if (dracoFile) {
        const dracoBuf = await dracoFile.async("arraybuffer");
        const decoded = await decodeDraco(dracoBuf, entry.name);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          "position",
          new THREE.BufferAttribute(decoded.vertices, 3),
        );
        geo.setIndex(new THREE.BufferAttribute(decoded.indices, 1));
        if (decoded.uvs) {
          geo.setAttribute("uv", new THREE.BufferAttribute(decoded.uvs, 2));
        }
        geo.computeVertexNormals();
        geometryMap.set(entry.name, geo);
        continue;
      }

      // Fallback: raw vertices + indices
      const vertsFile = zip.file(`geometry/${safeName}/vertices.bin`);
      const idxsFile = zip.file(`geometry/${safeName}/indices.bin`);
      const uvsFile = zip.file(`geometry/${safeName}/uvs.bin`);

      if (vertsFile && idxsFile) {
        const verts = new Float32Array(await vertsFile.async("arraybuffer"));
        const idxs = new Uint32Array(await idxsFile.async("arraybuffer"));

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
        geo.setIndex(new THREE.BufferAttribute(idxs, 1));
        if (uvsFile) {
          const uvs = new Float32Array(await uvsFile.async("arraybuffer"));
          geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        }
        geo.computeVertexNormals();
        geometryMap.set(entry.name, geo);
      }
    } catch (err) {
      console.warn(`[ProductionViewer] Geometry "${entry.name}" skipped:`, err);
    }
  }

  // Build meshes
  for (const obj of sceneData.objects) {
    // Use the canonical geometry name when instancing is active,
    // fall back to object name for non-instanced scenes.
    const geoName: string = (obj as any).geometry ?? obj.name;
    const geo = geometryMap.get(geoName);
    if (!geo) {
      console.warn(
        `[ProductionViewer] Geometry "${geoName}" not found for "${obj.name}"`,
      );
      continue;
    }

    const opacity = obj.opacity ?? 1;
    const alphaTest = obj.alphaTest ?? 0;
    const isTransparent = obj.transparent === true;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        obj.texture ? 1 : (obj.color?.[0] ?? 0.5),
        obj.texture ? 1 : (obj.color?.[1] ?? 0.5),
        obj.texture ? 1 : (obj.color?.[2] ?? 0.5),
      ),
      roughness: obj.roughness ?? 0.5,
      metalness: obj.metalness ?? 0,
      map: obj.texture ? (textureMap.get(obj.texture) ?? null) : null,
      roughnessMap: obj.roughnessMap
        ? (textureMap.get(obj.roughnessMap) ?? null)
        : null,
      metalnessMap: obj.metalnessMap
        ? (textureMap.get(obj.metalnessMap) ?? null)
        : null,
      normalMap: obj.normalMap ? (textureMap.get(obj.normalMap) ?? null) : null,
      side: THREE.FrontSide,
    });

    // Match tslMaterialBuilder: pass transparent directly,
    // only set opacity/alphaTest when non-default
    mat.transparent = isTransparent;
    if (opacity < 1.0) mat.opacity = opacity;
    if (alphaTest > 0) mat.alphaTest = alphaTest;
    if (obj.flatShading === true) mat.flatShading = true;

    loadedObjects.push({
      name: obj.name,
      geometry: geo,
      material: mat,
      position: obj.position,
      quaternion: obj.quaternion,
      scale: obj.scale,
    });
  }

  return {
    objects: loadedObjects,
    lights,
    cameras,
    hdrBytes,
    hdrIntensity,
  };
}

// ---------------------------------------------------------------------------
// Three.js scene content (rendered inside R3F Canvas)
// ---------------------------------------------------------------------------

function SceneContent({ scene }: { scene: ProductionScene }) {
  const gl = useThree((s) => s.gl);

  // Build PMREM from raw Float32 HDR inside the Canvas WebGL context
  const envMap = useMemo(() => {
    if (!scene.hdrBytes || scene.hdrBytes.byteLength === 0) {
      return null;
    }

    // HDR data is in Radiance RGBE format — use HDRLoader (same as SyncViewer)
    const loader = new HDRLoader();
    const hdrTex = loader.createDataTexture(scene.hdrBytes);
    hdrTex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(hdrTex).texture;
    hdrTex.dispose();
    pmrem.dispose();

    return env;
  }, [scene.hdrBytes, gl]);

  return (
    <>
      {/* Environment */}
      {envMap && (
        <Environment
          map={envMap}
          environmentIntensity={scene.hdrIntensity}
          background
        />
      )}

      {/* Meshes */}
      {scene.objects.map((obj) => (
        <mesh
          key={obj.name}
          geometry={obj.geometry}
          material={obj.material}
          position={obj.position}
          quaternion={obj.quaternion}
          scale={obj.scale}
          castShadow
          receiveShadow
        />
      ))}

      {/* Lights from Blender */}
      {scene.lights.map((light) => (
        <LightFromData key={light.name} light={light} />
      ))}

      {/* Fallback lighting if no scene lights */}
      {scene.lights.length === 0 && (
        <>
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[5, 10, 5]}
            intensity={1.5}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
        </>
      )}

      <ContactShadows
        position={[0, -0.01, 0]}
        scale={20}
        blur={2}
        far={4}
        opacity={0.4}
      />

      <OrbitControls makeDefault />
      {/* <gridHelper args={[20, 20, "#333", "#222"]} /> */}
    </>
  );
}

function LightFromData({ light }: { light: LightData }) {
  const color = new THREE.Color(light.color[0], light.color[1], light.color[2]);

  const position: [number, number, number] = light.position;
  const intensity = light.intensity;

  switch (light.type) {
    case "SUN":
      return (
        <directionalLight
          position={position}
          intensity={intensity}
          color={color}
          castShadow={light.castShadow}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
      );
    case "POINT":
      return (
        <pointLight
          position={position}
          intensity={intensity}
          color={color}
          distance={light.distance ?? 0}
          castShadow={light.castShadow}
          shadow-intensity={2}
        />
      );
    case "SPOT":
      return (
        <spotLight
          position={position}
          intensity={intensity}
          color={color}
          distance={light.distance ?? 0}
          angle={light.coneAngle ?? Math.PI / 6}
          penumbra={light.penumbra ?? 0.5}
          castShadow={light.castShadow}
        />
      );
    case "AREA":
      return (
        <rectAreaLight
          position={position}
          intensity={intensity}
          color={color}
          width={light.width ?? 1}
          height={light.height ?? 1}
        />
      );
    default:
      return (
        <pointLight position={position} intensity={intensity} color={color} />
      );
  }
}

// ---------------------------------------------------------------------------
// Loading / Error / Empty states
// ---------------------------------------------------------------------------

function LoadingView() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-surface-primary text-text-muted text-xs font-mono">
      <div className="flex flex-col items-center gap-2">
        <svg
          className="animate-spin h-6 w-6 text-accent"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span>Loading production scene…</span>
      </div>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-surface-primary text-status-red text-xs font-mono">
      <div className="flex flex-col items-center gap-2 max-w-[320px] text-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <span>Failed to load scene</span>
        <span className="text-text-muted/60 text-[10px]">{message}</span>
      </div>
    </div>
  );
}

function EmptyView() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-surface-primary text-text-muted text-xs font-mono">
      <span>No scene data in zip.</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProductionViewer({ zipBuffer }: { zipBuffer: ArrayBuffer }) {
  const [state, setState] = useState<{
    status: "loading" | "loaded" | "error" | "empty";
    scene?: ProductionScene;
    error?: string;
  }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const scene = await loadProductionScene(zipBuffer);
        if (cancelled) return;
        if (scene.objects.length === 0 && !scene.hdrBytes) {
          setState({ status: "empty" });
        } else {
          setState({ status: "loaded", scene });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [zipBuffer]);

  if (state.status === "loading") return <LoadingView />;
  if (state.status === "error") return <ErrorView message={state.error!} />;
  if (state.status === "empty") return <EmptyView />;

  return (
    <div className="h-full w-full relative">
      <Canvas
        shadows
        camera={{ position: [5, 5, 5], fov: 50 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
      >
        <Suspense fallback={null}>
          <SceneContent scene={state.scene!} />
        </Suspense>
      </Canvas>
    </div>
  );
}
