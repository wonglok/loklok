"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { useThree, useFrame } from "@react-three/fiber";
import { useBlenderStore } from "../../stores/blenderStore";
import { useBlenderSyncStore } from "../../stores/blenderSyncStore";
import {
  buildGeometry,
  buildMaterial,
  computeMaterialCacheKey,
} from "../../utils/meshBuilder";
import { getGraphImageNames } from "../../utils/tslMaterialBuilder";

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
// Module-level state
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
// Constants
// ---------------------------------------------------------------------------
const LERP_SMOOTH = 0.15;

let _ready = false;
const _mat4 = new THREE.Matrix4();

const _requestedGeo = new Set<string>();
const _requestedTex = new Set<string>();

// ---------------------------------------------------------------------------
// Meshes — each Blender object gets its own InstancedMesh.
// Requests missing geometry and textures from Blender on demand.
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

  // ---- Build / rebuild meshes, request missing resources ----
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;

    const { send } = useBlenderSyncStore.getState();
    if (!send) return;

    const meshes = meshesRef.current;
    const incomingNames = new Set<string>();

    for (const obj of sceneData.objects) {
      incomingNames.add(obj.name);

      const geoBuf = geoBuffers.get(obj.name);

      // Request geometry if missing or version mismatch
      if (
        (!geoBuf || geoBuf.version !== obj.version) &&
        !_requestedGeo.has(obj.name)
      ) {
        _requestedGeo.add(obj.name);
        console.log(`[Meshes] requesting geo: ${obj.name}`);
        send({ type: "request-geo", name: obj.name });
      }

      // Request textures referenced by graph
      const imageNames = getGraphImageNames(obj.graph);
      for (const imgName of imageNames) {
        if (!texData.has(imgName) && !_requestedTex.has(imgName)) {
          _requestedTex.add(imgName);
          console.log(`[Meshes] requesting tex: ${imgName}`);
          send({ type: "request-tex", name: imgName });
        }
      }

      // Skip mesh building if geometry isn't ready
      if (!geoBuf || geoBuf.version !== obj.version) continue;

      // ---- Build material from graph only ----
      const matKey = computeMaterialCacheKey({ graph: obj.graph, texData });
      const material = buildMaterial({ graph: obj.graph, texData });

      const geoVersion = geoBuf.version;

      // ---- Target transform ----
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

      if (wasNew) {
        tx.initialized = false;
      }

      // ---- Rebuild mesh if geometry or material changed ----
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

        const geo = buildGeometry(geoBuf, false);
        const im = new THREE.InstancedMesh(geo, material, 1);
        im.name = obj.name;
        im.castShadow = true;
        im.receiveShadow = true;
        sc.add(im);

        cached = { mesh: im, geoVersion, materialKey: matKey };
        meshes.set(obj.name, cached);
      }
    }

    // ---- Mark ready once all objects have geometry ----
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

  // ---- Per-frame interpolation ----
  useFrame(() => {
    const meshes = meshesRef.current;
    for (const [name, cached] of meshes) {
      const tx = _transformStates.get(name);
      if (!tx) continue;

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
