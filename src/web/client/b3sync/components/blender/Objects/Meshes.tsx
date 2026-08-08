"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { useThree, useFrame } from "@react-three/fiber";
import { useBlenderStore } from "../../stores/blenderStore";
import {
  buildGeometry,
  buildMaterial,
  computeMaterialCacheKey,
  getOrCreateTexture,
  type BuildMaterialParams,
} from "../../utils/meshBuilder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CachedMesh {
  mesh: THREE.InstancedMesh;
  geoVersion: string;
  materialKey: string;
}

interface TransformState {
  targetPos: THREE.Vector3;
  targetQuat: THREE.Quaternion;
  targetScale: THREE.Vector3;
  currentPos: THREE.Vector3;
  currentQuat: THREE.Quaternion;
  currentScale: THREE.Vector3;
  initialized: boolean;
}

// ---------------------------------------------------------------------------
// Module-level transform state — persisted across renders
// ---------------------------------------------------------------------------
const _transformStates = new Map<string, TransformState>();

function getOrCreateTransform(name: string): TransformState {
  let s = _transformStates.get(name);
  if (!s) {
    s = {
      targetPos: new THREE.Vector3(),
      targetQuat: new THREE.Quaternion(),
      targetScale: new THREE.Vector3(1, 1, 1),
      currentPos: new THREE.Vector3(),
      currentQuat: new THREE.Quaternion(),
      currentScale: new THREE.Vector3(1, 1, 1),
      initialized: false,
    };
    _transformStates.set(name, s);
  }
  return s;
}

function disposeTransform(name: string): void {
  _transformStates.delete(name);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const LERP_SMOOTH = 0.15;

/** Flips to true once all objects have their geometry loaded on the first full sync. */
let _ready = false;

const _mat4 = new THREE.Matrix4();

// ---------------------------------------------------------------------------
// Meshes — each Blender object gets its own InstancedMesh.
// Transforms are interpolated via useFrame (lerp / slerp).
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

  // ---- Build / rebuild meshes when scene data, textures, or geometry change ----
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

      // ---- Build material ----
      const matParams = materialParamsFromObject(
        obj,
        map,
        roughnessMap,
        metalnessMap,
        normalMap,
        emissiveMap,
      );
      const material = buildMaterial(matParams);

      // ---- Version keys ----
      const geoVersion = geoBuf?.version ?? "";
      const matKey = computeMaterialCacheKey(matParams);

      // ---- Set target transform from Blender data ----
      const tx = getOrCreateTransform(obj.name);
      const wasNew = !meshes.has(obj.name);
      tx.targetPos.set(obj.position[0], obj.position[1], obj.position[2]);
      tx.targetQuat.set(
        obj.quaternion[0],
        obj.quaternion[1],
        obj.quaternion[2],
        obj.quaternion[3],
      );
      tx.targetScale.set(obj.scale[0], obj.scale[1], obj.scale[2]);

      // Reset interpolation on first appearance so next frame snaps (LERP 1.0)
      if (wasNew) {
        tx.initialized = false;
      }

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
          const geo = buildGeometry(geoBuf, !!normalMap);
          const im = new THREE.InstancedMesh(geo, material, 1);
          im.name = obj.name;
          im.castShadow = true;
          im.receiveShadow = true;
          sc.add(im);

          // Set initial matrix from current (will be set in useFrame)

          cached = { mesh: im, geoVersion, materialKey: matKey };
          meshes.set(obj.name, cached);
        }
      }
    }

    // ---- Mark ready once all objects have geometry on first full sync ----
    if (!_ready && sceneData.objects.length > 0) {
      const allHaveGeo = sceneData.objects.every((obj) => {
        const buf = geoBuffers.get(obj.name);
        return buf && buf.version === obj.version;
      });
      if (allHaveGeo) {
        _ready = true;
      }
    }

    // ---- Cleanup stale meshes ----
    for (const [name, entry] of meshes) {
      if (!incomingNames.has(name)) {
        sc.remove(entry.mesh);
        meshes.delete(name);
        disposeTransform(name);
      }
    }
  }, [sceneData, texData, geoBuffers, scene]);

  // ---- Per-frame interpolation (lerp position/scale, slerp quaternion) ----
  useFrame(() => {
    const meshes = meshesRef.current;
    for (const [name, cached] of meshes) {
      const tx = _transformStates.get(name);
      if (!tx) continue;

      // Snap on first frame, smooth interpolate thereafter
      const f = tx.initialized ? LERP_SMOOTH : 1.0;
      tx.initialized = true;

      tx.currentPos.lerp(tx.targetPos, f);
      tx.currentQuat.slerp(tx.targetQuat, f);
      tx.currentScale.lerp(tx.targetScale, f);

      _mat4.compose(tx.currentPos, tx.currentQuat, tx.currentScale);
      cached.mesh.setMatrixAt(0, _mat4);
      cached.mesh.instanceMatrix.needsUpdate = true;
    }
  });

  if (!_ready) return null;

  return null;
}
