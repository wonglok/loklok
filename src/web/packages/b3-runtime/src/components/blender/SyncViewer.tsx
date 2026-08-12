"use client";

import { useEffect } from "react";
import * as THREE from "three/webgpu";
import { useThree } from "@react-three/fiber";
import { useBlenderStore } from "../stores/blenderStore";
import {
  _geoMaterialCache,
  getOrCreateTexture,
  buildGeometryFromBuffer,
  computeMeshCacheKey,
} from "../utils/meshBuilder";
import { HDRLoader } from "three/examples/jsm/Addons.js";
import type { BlenderObject } from "../types/blenderTypes";
import { LightFromData } from "./LightFromData";
import { useMeshSync } from "./useMeshSync";

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

import { useBlenderSyncStore } from "../stores/blenderSyncStore";
import { useSettingsStore } from "../stores/settingsStore";

export function RefreshButton({
  className = "block px-3 py-1 text-white text-sm bg-blue-500 rounded-lg m-1",
}) {
  let connectionState = useBlenderStore((r) => r.connectionState);
  return (
    <>
      <button
        onClick={() => {
          //
          useBlenderSyncStore.getState().refresh();
        }}
        className={className}
      >
        Refresh{" "}
        {connectionState === "connected" ? `[Connected]` : `[Disconnected]`}
      </button>
    </>
  );
}

export function BlenderConnection() {
  const disconnect = useBlenderSyncStore((s) => s.disconnect);

  // Hydrate persisted settings from localStorage on the client (SSR-safe)
  const hydrate = useSettingsStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Connect to Blender WebSocket on mount, disconnect on unmount
  useEffect(() => {
    const connectFn = useBlenderSyncStore.getState().connect;
    connectFn();

    return () => {
      disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <></>;
}

export function SyncViewer() {
  const sceneData = useBlenderStore((s) => s.sceneData);
  const hdrData = useBlenderStore((s) => s.hdrData);
  const hdrIntensity = useBlenderStore((s) => s.hdrIntensity);
  const texData = useBlenderStore((s) => s.texData);
  const geoBuffers = useBlenderStore((s) => s.geoBuffers);
  const lights = useBlenderStore((s) => s.lights);

  const scene = useThree((r) => r.scene);
  const gl = useThree((r) => r.gl);

  // ------------------------------------------------------------------
  // Apply HDR environment map (only when pixel data changes)
  // ------------------------------------------------------------------
  useEffect(() => {
    const renderer = gl;
    if (!renderer || !scene) return;

    if (!hdrData || hdrData.width === 0) {
      scene.environment = null;
      scene.background = new THREE.Color("#f4f4f4");
      return;
    }

    const hdrLoader = new HDRLoader();
    const texture = hdrLoader.createDataTexture(hdrData.pixels);
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const pmremGenerator = new THREE.PMREMGenerator(renderer as any);
    pmremGenerator.compileEquirectangularShader();
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;

    scene.environment = envMap;
    scene.background = texture;

    texture.dispose();
    pmremGenerator.dispose();
  }, [hdrData?.pixels.byteLength, scene, gl]);

  // ------------------------------------------------------------------
  // Apply environment intensity (updated independently — cheap, no PMREM rebuild)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!scene) return;
    scene.environmentIntensity = hdrIntensity;
  }, [hdrIntensity, scene]);

  // ------------------------------------------------------------------
  // Sync meshes from Blender data (with InstancedMesh batching)
  // ------------------------------------------------------------------
  useMeshSync({
    scene: scene!,
    objects: sceneData.objects,
    resolveTextures: (obj: BlenderObject) => ({
      map: obj.texture
        ? getOrCreateTexture(obj.texture, texData, "color")
        : null,
      roughnessMap: obj.roughnessMap
        ? getOrCreateTexture(obj.roughnessMap, texData, "noncolor")
        : null,
      metalnessMap: obj.metalnessMap
        ? getOrCreateTexture(obj.metalnessMap, texData, "noncolor")
        : null,
      normalMap: obj.normalMap
        ? getOrCreateTexture(obj.normalMap, texData, "noncolor")
        : null,
      emissiveMap: obj.emissiveMap
        ? getOrCreateTexture(obj.emissiveMap, texData, "color")
        : null,
    }),
    computeCacheKey: (obj: BlenderObject, textures) => {
      const geoBuf = geoBuffers.get(obj.name);
      return computeMeshCacheKey(
        obj.name,
        obj.version,
        geoBuf?.version,
        textures.map,
        textures.roughnessMap,
        textures.metalnessMap,
        textures.normalMap,
        textures.emissiveMap,
      );
    },
    buildGeometryMaterial: (obj: BlenderObject, textures) => {
      const geoBuf = geoBuffers.get(obj.name);
      if (!geoBuf || geoBuf.version !== obj.version) return null;

      const geoName = (obj as any).geometry ?? obj.name;
      const cacheKey = computeMeshCacheKey(
        geoName,
        obj.version,
        geoBuf.version,
        textures.map,
        textures.roughnessMap,
        textures.metalnessMap,
        textures.normalMap,
        textures.emissiveMap,
      );

      let geoMat = _geoMaterialCache.get(cacheKey);
      if (!geoMat) {
        geoMat = buildGeometryFromBuffer({
          buf: geoBuf,
          color: obj.color,
          roughness: obj.roughness ?? 0.5,
          metalness: obj.metalness ?? 0.0,
          emissiveColor: obj.emissiveColor ?? [0, 0, 0],
          emissiveIntensity: obj.emissiveIntensity ?? 0.0,
          map: textures.map,
          roughnessMap: textures.roughnessMap,
          metalnessMap: textures.metalnessMap,
          normalMap: textures.normalMap,
          emissiveMap: textures.emissiveMap,
          transparent: obj.transparent,
          opacity: obj.opacity,
          alphaTest: obj.alphaTest,
          flatShading: obj.flatShading,
          graph: obj.graph,
        }) as any;
        _geoMaterialCache.set(cacheKey, geoMat as any);
      }

      return geoMat as any;
    },
  });

  // Blender energy (Watts) → Three.js intensity conversion.
  // Multiply by 4π to convert radiant flux to luminous intensity,
  // then divide by 25 to bring values into a practical range.
  const ENERGY_SCALE = 1 / 10;

  return (
    <group>
      {/* Lights from Blender — declarative via shared LightFromData */}
      {lights.map((light) => (
        <LightFromData
          key={light.name}
          light={light}
          intensityScale={ENERGY_SCALE}
        />
      ))}
    </group>
  );
}
