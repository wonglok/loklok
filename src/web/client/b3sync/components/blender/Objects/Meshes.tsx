"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { useThree } from "@react-three/fiber";
import { useBlenderStore } from "../../stores/blenderStore";
import {
  buildGeometry,
  buildMaterial,
  computeMaterialCacheKey,
  getOrCreateTexture,
  composeMatrix,
  type BuildMaterialParams,
} from "../../utils/meshBuilder";

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------
interface CachedMesh {
  mesh: THREE.InstancedMesh;
  geoVersion: string;
  materialKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive material params from a Blender object + resolved textures. */
function materialParamsFromObject(
  obj: any,
  map: THREE.Texture | null,
  roughnessMap: THREE.Texture | null,
  metalnessMap: THREE.Texture | null,
  normalMap: THREE.Texture | null,
  emissiveMap: THREE.Texture | null,
): BuildMaterialParams {
  return {
    color: obj.color,
    roughness: obj.roughness ?? 0.5,
    metalness: obj.metalness ?? 0.0,
    emissiveColor: obj.emissiveColor ?? [0, 0, 0],
    emissiveIntensity: obj.emissiveIntensity ?? 0.0,
    map,
    roughnessMap,
    metalnessMap,
    normalMap,
    emissiveMap,
    transparent: obj.transparent,
    opacity: obj.opacity,
    alphaTest: obj.alphaTest,
    flatShading: obj.flatShading,
    graph: obj.graph,
  };
}

// ---------------------------------------------------------------------------
// Meshes — each Blender object gets its own InstancedMesh.
// Geometry and material are built and cached independently.
// ---------------------------------------------------------------------------

export function Meshes() {
  const sceneData = useBlenderStore((s) => s.sceneData);
  const texData = useBlenderStore((s) => s.texData);
  const geoBuffers = useBlenderStore((s) => s.geoBuffers);

  const scene = useThree((r) => r.scene);
  const sceneRef = useRef<THREE.Scene | null>(scene);
  const meshesRef = useRef<Map<string, CachedMesh>>(new Map());

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;

    const meshes = meshesRef.current;
    const incomingNames = new Set<string>();

    for (const obj of sceneData.objects) {
      incomingNames.add(obj.name);

      const geoBuf = geoBuffers.get(obj.name);

      // ---- Resolve textures ----
      const map = obj.texture
        ? getOrCreateTexture(obj.texture, texData, "color")
        : null;
      const roughnessMap = obj.roughnessMap
        ? getOrCreateTexture(obj.roughnessMap, texData, "noncolor")
        : null;
      const metalnessMap = obj.metalnessMap
        ? getOrCreateTexture(obj.metalnessMap, texData, "noncolor")
        : null;
      const normalMap = obj.normalMap
        ? getOrCreateTexture(obj.normalMap, texData, "noncolor")
        : null;
      const emissiveMap = obj.emissiveMap
        ? getOrCreateTexture(obj.emissiveMap, texData, "color")
        : null;

      // ---- Build material (cached independently of geometry) ----
      const matParams = materialParamsFromObject(
        obj,
        map,
        roughnessMap,
        metalnessMap,
        normalMap,
        emissiveMap,
      );
      const material = buildMaterial(matParams);

      // ---- Compute version keys ----
      const geoVersion = geoBuf?.version ?? "";
      const matKey = computeMaterialCacheKey(matParams);

      // ---- Check if rebuild needed ----
      let cached = meshes.get(obj.name);

      if (
        !cached ||
        cached.geoVersion !== geoVersion ||
        cached.materialKey !== matKey
      ) {
        if (cached) {
          sc.remove(cached.mesh);
          cached = undefined;
        }

        if (geoBuf && geoBuf.version === obj.version) {
          // Build geometry (cached independently of material)
          const geo = buildGeometry(geoBuf, !!normalMap);

          const im = new THREE.InstancedMesh(geo, material, 1);
          im.name = obj.name;
          im.castShadow = true;
          im.receiveShadow = true;
          sc.add(im);

          cached = { mesh: im, geoVersion, materialKey: matKey };
          meshes.set(obj.name, cached);
        }
      }

      // ---- Update transform ----
      if (cached) {
        const m = composeMatrix(obj.position, obj.quaternion, obj.scale);
        cached.mesh.setMatrixAt(0, m);
        cached.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // ---- Cleanup stale meshes ----
    for (const [name, entry] of meshes) {
      if (!incomingNames.has(name)) {
        sc.remove(entry.mesh);
        meshes.delete(name);
      }
    }
  }, [sceneData, texData, geoBuffers, scene]);

  return null;
}
