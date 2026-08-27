"use client";

import { useEffect } from "react";
import * as THREE from "three/webgpu";
import { useThree } from "@react-three/fiber";
import { useBlenderStore } from "../../stores/blenderStore";
import {
  _geoMaterialCache,
  getOrCreateTexture,
  buildGeometryFromBuffer,
  computeMeshCacheKey,
  type TexKind,
} from "../../utils/meshBuilder";
import type { BlenderObject } from "../../types/blenderTypes";
import { LightFromData } from "../canvas-units/LightFromData";
import { useMeshSync } from "../canvas-units/useMeshSync";
import { useEnvironmentMap } from "../canvas-units/useEnvironmentMap";

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

import { useBlenderSyncStore } from "../../stores/blenderSyncStore";
import { useSettingsStore } from "../../stores/settingsStore";

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

export function SyncContent() {
  const sceneData = useBlenderStore((s) => s.sceneData);
  // const hdrData = useBlenderStore((s) => s.hdrData);
  // const hdrIntensity = useBlenderStore((s) => s.hdrIntensity);
  const texData = useBlenderStore((s) => s.texData);
  const geoBuffers = useBlenderStore((s) => s.geoBuffers);
  const lights = useBlenderStore((s) => s.lights);

  const scene = useThree((r) => r.scene);
  // const gl = useThree((r) => r.gl);

  // ------------------------------------------------------------------
  // Sync meshes from Blender data (with InstancedMesh batching)
  // ------------------------------------------------------------------
  useMeshSync({
    scene: scene!,
    objects: sceneData.objects,
    resolveTextures: (obj: BlenderObject) => {
      const mapOf = (name: string | undefined, kind: TexKind) =>
        name ? getOrCreateTexture(name, texData, kind) : null;

      // Resolve textures referenced by the graph's TEX_IMAGE / TEX_ENVIRONMENT
      // nodes (colour space drives the TexKind).
      const graphTextures = new Map<string, THREE.Texture>();
      for (const n of obj.graph?.nodes ?? []) {
        if (n.type !== "tex-image" && n.type !== "tex-environment") continue;
        const sock = n.inputs.find((s) => s.name === "image");
        if (!sock || typeof sock.value !== "string") continue;
        const kind: TexKind = n.colorspace === "Non-Color" ? "noncolor" : "color";
        const tex = getOrCreateTexture(sock.value, texData, kind);
        if (tex) graphTextures.set(sock.value, tex);
      }

      return {
        map: mapOf(obj.texture, "color"),
        roughnessMap: mapOf(obj.roughnessMap, "noncolor"),
        metalnessMap: mapOf(obj.metalnessMap, "noncolor"),
        normalMap: mapOf(obj.normalMap, "noncolor"),
        emissiveMap: mapOf(obj.emissiveMap, "color"),
        clearcoatMap: mapOf(obj.clearcoatMap, "noncolor"),
        clearcoatRoughnessMap: mapOf(obj.clearcoatRoughnessMap, "noncolor"),
        clearcoatNormalMap: mapOf(obj.clearcoatNormalMap, "noncolor"),
        sheenColorMap: mapOf(obj.sheenColorMap, "color"),
        sheenRoughnessMap: mapOf(obj.sheenRoughnessMap, "noncolor"),
        iridescenceMap: mapOf(obj.iridescenceMap, "noncolor"),
        iridescenceThicknessMap: mapOf(obj.iridescenceThicknessMap, "noncolor"),
        anisotropyMap: mapOf(obj.anisotropyMap, "noncolor"),
        transmissionMap: mapOf(obj.transmissionMap, "noncolor"),
        thicknessMap: mapOf(obj.thicknessMap, "noncolor"),
        specularColorMap: mapOf(obj.specularColorMap, "color"),
        specularIntensityMap: mapOf(obj.specularIntensityMap, "noncolor"),
        graphTextures,
      };
    },
    computeCacheKey: (obj: BlenderObject, textures) => {
      const geoBuf = geoBuffers.get(obj.name);
      return computeMeshCacheKey(obj.name, obj.version, geoBuf?.version, [
        textures.map,
        textures.roughnessMap,
        textures.metalnessMap,
        textures.normalMap,
        textures.emissiveMap,
        textures.clearcoatMap,
        textures.clearcoatRoughnessMap,
        textures.clearcoatNormalMap,
        textures.sheenColorMap,
        textures.sheenRoughnessMap,
        textures.iridescenceMap,
        textures.iridescenceThicknessMap,
        textures.anisotropyMap,
        textures.transmissionMap,
        textures.thicknessMap,
        textures.specularColorMap,
        textures.specularIntensityMap,
      ]);
    },
    buildGeometryMaterial: (obj: BlenderObject, textures) => {
      const geoBuf = geoBuffers.get(obj.name);
      if (!geoBuf || geoBuf.version !== obj.version) return null;

      const geoName = (obj as any).geometry ?? obj.name;
      const cacheKey = computeMeshCacheKey(geoName, obj.version, geoBuf.version, [
        textures.map,
        textures.roughnessMap,
        textures.metalnessMap,
        textures.normalMap,
        textures.emissiveMap,
        textures.clearcoatMap,
        textures.clearcoatRoughnessMap,
        textures.clearcoatNormalMap,
        textures.sheenColorMap,
        textures.sheenRoughnessMap,
        textures.iridescenceMap,
        textures.iridescenceThicknessMap,
        textures.anisotropyMap,
        textures.transmissionMap,
        textures.thicknessMap,
        textures.specularColorMap,
        textures.specularIntensityMap,
      ]);

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
          resolveImage: (name, kind) =>
            textures.graphTextures?.get(name) ??
            getOrCreateTexture(name, texData, kind),
          // Physical channels (flat path; graph path ignores these)
          clearcoat: obj.clearcoat ?? 0,
          clearcoatRoughness: obj.clearcoatRoughness ?? 0.03,
          clearcoatMap: textures.clearcoatMap,
          clearcoatRoughnessMap: textures.clearcoatRoughnessMap,
          clearcoatNormalMap: textures.clearcoatNormalMap,
          sheen: obj.sheen ?? 0,
          sheenRoughness: obj.sheenRoughness ?? 0.5,
          sheenColor: [
            1 + (obj.color[0] - 1) * (obj.sheenTint ?? 0.5),
            1 + (obj.color[1] - 1) * (obj.sheenTint ?? 0.5),
            1 + (obj.color[2] - 1) * (obj.sheenTint ?? 0.5),
          ],
          sheenColorMap: textures.sheenColorMap,
          sheenRoughnessMap: textures.sheenRoughnessMap,
          specularIntensity: obj.specularIntensity ?? 0.5,
          specularColor: obj.specularColor ?? [1, 1, 1],
          specularColorMap: textures.specularColorMap,
          specularIntensityMap: textures.specularIntensityMap,
          iridescence: obj.iridescence ?? 0,
          iridescenceMap: textures.iridescenceMap,
          iridescenceIOR: obj.iridescenceIOR ?? 1.3,
          iridescenceThicknessRange: [
            obj.iridescenceThicknessMin ?? 100,
            obj.iridescenceThicknessMax ?? 400,
          ],
          iridescenceThicknessMap: textures.iridescenceThicknessMap,
          anisotropy: obj.anisotropy ?? 0,
          anisotropyMap: textures.anisotropyMap,
          transmission: obj.transmission ?? 0,
          transmissionMap: textures.transmissionMap,
          thickness: obj.thickness ?? 0,
          thicknessMap: textures.thicknessMap,
          attenuationDistance: obj.attenuationDistance ?? 0,
          attenuationColor: obj.attenuationColor ?? [1, 1, 1],
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

export function SyncLighting() {
  const hdrData = useBlenderStore((s) => s.hdrData);
  const hdrIntensity = useBlenderStore((s) => s.hdrIntensity);

  const scene = useThree((r) => r.scene);
  const gl = useThree((r) => r.gl);

  // ------------------------------------------------------------------
  // Apply HDR environment map + intensity (shared hook)
  // ------------------------------------------------------------------
  useEnvironmentMap({
    scene: scene!,
    renderer: gl,
    hdrPixels: hdrData?.pixels,
    intensity: hdrIntensity,
    background: true,
    fallbackColor: "#f4f4f4",
  });

  return null;
}
