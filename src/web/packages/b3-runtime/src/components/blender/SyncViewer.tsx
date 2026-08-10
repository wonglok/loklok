"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { useThree } from "@react-three/fiber";
import { useBlenderStore } from "../stores/blenderStore";
import {
  _geoMaterialCache,
  getOrCreateTexture,
  buildGeometryFromBuffer,
  computeMeshCacheKey,
  type InstancedGroupEntry,
} from "../utils/meshBuilder";
import { HDRLoader } from "three/examples/jsm/Addons.js";
import type { BlenderObject, GeoBuffer } from "../types/blenderTypes";

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------
interface CachedMesh {
  mesh: THREE.Mesh;
  version: string;
}

/** Track which instance index an object occupies within its InstancedMesh. */
interface InstanceSlot {
  mesh: THREE.InstancedMesh;
  index: number;
}

/** Shallow set equality check. */
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

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
  const sceneRef = useRef<THREE.Scene | null>(scene);
  const meshesRef = useRef<Map<string, CachedMesh>>(new Map());
  const instancedRef = useRef<Map<string, InstancedGroupEntry>>(new Map());
  const instanceSlotsRef = useRef<Map<string, InstanceSlot>>(new Map());
  const lightsRef = useRef<THREE.Light[]>([]);

  const gl = useThree((r) => r.gl);

  useEffect(() => {
    //
    //
  }, []);
  //
  //

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
  // Sync lights from Blender data
  // ------------------------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove any previously synced lights from the scene
    const prevLights = lightsRef.current;
    for (const l of prevLights) {
      scene.remove(l);
    }
    lightsRef.current = [];

    // Blender energy (Watts) → Three.js intensity conversion.
    // Multiply by 4π to convert radiant flux to luminous intensity,
    // then divide by 25 to bring values into a practical range.
    const ENERGY_SCALE = 1 / 10;

    for (const l of lights) {
      const color = new THREE.Color(l.color[0], l.color[1], l.color[2]);
      const intensity = l.intensity * ENERGY_SCALE;

      let threeLight: THREE.Light;

      switch (l.type) {
        case "POINT": {
          const pt = new THREE.PointLight(color, intensity, l.distance || 0);
          if (l.distance && l.distance > 0) pt.decay = 2;
          threeLight = pt;
          break;
        }
        case "SUN": {
          threeLight = new THREE.DirectionalLight(color, intensity);
          break;
        }
        case "SPOT": {
          const spot = new THREE.SpotLight(
            color,
            intensity,
            l.distance || 0,
            l.coneAngle ?? Math.PI / 4,
            l.penumbra ?? 0,
          );
          if (l.distance && l.distance > 0) spot.decay = 2;
          threeLight = spot;
          break;
        }
        case "AREA": {
          const w = l.width ?? 1;
          const h = l.height ?? 1;
          // Three.js only supports rectangular area lights; DISK/ELLIPSE
          // are approximated as square.
          threeLight = new THREE.RectAreaLight(color, intensity, w, h);
          break;
        }
        default:
          continue; // unknown type — skip
      }

      threeLight.name = l.name;
      threeLight.castShadow = !!l.castShadow;
      threeLight.position.set(l.position[0], l.position[1], l.position[2]);
      threeLight.quaternion.set(
        l.quaternion[0],
        l.quaternion[1],
        l.quaternion[2],
        l.quaternion[3],
      );

      scene.add(threeLight);
      lightsRef.current.push(threeLight);
    }
  }, [lights, scene]);

  // ------------------------------------------------------------------
  // Sync meshes from Blender data (with InstancedMesh batching)
  // ------------------------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const meshes = meshesRef.current;
    const instanced = instancedRef.current;
    const slots = instanceSlotsRef.current;
    const incomingNames = new Set<string>();

    // ---- Phase 0: resolve textures & compute cache keys for every object ----
    interface ObjectWithKey {
      obj: BlenderObject;
      cacheKey: string;
      map: THREE.Texture | null;
      roughnessMap: THREE.Texture | null;
      metalnessMap: THREE.Texture | null;
      normalMap: THREE.Texture | null;
      emissiveMap: THREE.Texture | null;
      geoBuf: GeoBuffer | undefined;
    }

    const resolved: ObjectWithKey[] = [];

    for (const obj of sceneData.objects) {
      const geoBuf = geoBuffers.get(obj.name);

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

      const cacheKey = computeMeshCacheKey(
        obj.name,
        obj.version,
        geoBuf?.version,
        map,
        roughnessMap,
        metalnessMap,
        normalMap,
        emissiveMap,
      );

      resolved.push({
        obj,
        cacheKey,
        map,
        roughnessMap,
        metalnessMap,
        normalMap,
        emissiveMap,
        geoBuf,
      });
    }

    // ---- Phase 1: group by cache key ----
    const groups = new Map<string, ObjectWithKey[]>();
    for (const r of resolved) {
      if (!groups.has(r.cacheKey)) groups.set(r.cacheKey, []);
      groups.get(r.cacheKey)!.push(r);
    }

    // ---- Phase 2: build / update meshes per group ----
    for (const [cacheKey, items] of groups) {
      for (const item of items) incomingNames.add(item.obj.name);

      if (items.length > 1) {
        // ================================================================
        // INSTANCED path — N objects share the same geometry + material
        // ================================================================
        const first = items[0];
        if (!first.geoBuf || first.geoBuf.version !== first.obj.version)
          continue;

        const currentNames = new Set(items.map((it) => it.obj.name));
        let entry = instanced.get(cacheKey);

        // Rebuild if membership changed or doesn't exist yet
        const needsRebuild =
          !entry ||
          entry.mesh.count !== items.length ||
          !setsEqual(entry.names, currentNames);

        if (needsRebuild) {
          // Remove old instanced mesh
          if (entry) {
            for (const n of entry.names) slots.delete(n);
            scene.remove(entry.mesh);
          }

          // Build geometry + material (once for the group)
          let geoMat = _geoMaterialCache.get(cacheKey);
          if (!geoMat) {
            geoMat = buildGeometryFromBuffer({
              buf: first.geoBuf,
              color: first.obj.color,
              roughness: first.obj.roughness ?? 0.5,
              metalness: first.obj.metalness ?? 0.0,
              emissiveColor: first.obj.emissiveColor ?? [0, 0, 0],
              emissiveIntensity: first.obj.emissiveIntensity ?? 0.0,
              map: first.map,
              roughnessMap: first.roughnessMap,
              metalnessMap: first.metalnessMap,
              normalMap: first.normalMap,
              emissiveMap: first.emissiveMap,
              transparent: first.obj.transparent,
              opacity: first.obj.opacity,
              alphaTest: first.obj.alphaTest,
              flatShading: first.obj.flatShading,
              graph: first.obj.graph,
            }) as any;
            _geoMaterialCache.set(cacheKey, geoMat as any);
          }

          const im = new THREE.InstancedMesh(
            (geoMat as any).geometry,
            (geoMat as any).material,
            items.length,
          );
          im.castShadow = true;
          im.receiveShadow = true;
          scene.add(im);

          entry = { mesh: im, names: currentNames };
          instanced.set(cacheKey, entry);
        }

        // Track slots & set instance matrices directly
        items.forEach((item, i) => {
          const name = item.obj.name;
          const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(
              item.obj.position[0],
              item.obj.position[1],
              item.obj.position[2],
            ),
            new THREE.Quaternion(
              item.obj.quaternion[0],
              item.obj.quaternion[1],
              item.obj.quaternion[2],
              item.obj.quaternion[3],
            ),
            new THREE.Vector3(
              item.obj.scale[0],
              item.obj.scale[1],
              item.obj.scale[2],
            ),
          );

          slots.set(name, { mesh: entry!.mesh, index: i });
          entry!.mesh.setMatrixAt(i, matrix);
        });

        if (entry) entry.mesh.instanceMatrix.needsUpdate = true;

        // Ensure there's no stale regular mesh for any of these objects
        if (entry) {
          for (const item of items) {
            const old = meshes.get(item.obj.name);
            if (old) {
              scene.remove(old.mesh);
              meshes.delete(item.obj.name);
            }
          }
        }
      } else {
        // ================================================================
        // SINGLE-INSTANCE path — regular Mesh (same as before)
        // ================================================================
        const {
          obj,
          cacheKey,
          map,
          roughnessMap,
          metalnessMap,
          normalMap,
          emissiveMap,
        } = items[0];
        const geoBuf = items[0].geoBuf;

        // Remove from any previous instanced group
        const slot = slots.get(obj.name);
        if (slot) {
          slots.delete(obj.name);
        }

        let cached = meshes.get(obj.name);

        if (!cached || cached.version !== cacheKey) {
          if (cached) {
            scene.remove(cached.mesh);
            cached = undefined;
          }

          if (geoBuf && geoBuf.version === obj.version) {
            let geoMat = _geoMaterialCache.get(cacheKey);
            if (!geoMat) {
              geoMat = buildGeometryFromBuffer({
                buf: geoBuf,
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
              }) as any;
              _geoMaterialCache.set(cacheKey, geoMat as any);
            }

            const mesh = new THREE.Mesh(
              (geoMat as any).geometry,
              (geoMat as any).material,
            );
            mesh.name = obj.name;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);

            cached = { mesh, version: cacheKey };
            meshes.set(obj.name, cached);
          }
        }

        // Set transform directly
        if (cached) {
          cached.mesh.position.set(
            obj.position[0],
            obj.position[1],
            obj.position[2],
          );
          cached.mesh.quaternion.set(
            obj.quaternion[0],
            obj.quaternion[1],
            obj.quaternion[2],
            obj.quaternion[3],
          );
          cached.mesh.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
        }
      }
    }

    // ---- Phase 3: cleanup ----
    // Remove stale regular meshes
    for (const [name, entry] of meshes) {
      if (!incomingNames.has(name)) {
        scene.remove(entry.mesh);
        meshes.delete(name);
      }
    }

    // Remove stale instanced groups
    for (const [cacheKey, entry] of instanced) {
      if (!groups.has(cacheKey)) {
        for (const n of entry.names) slots.delete(n);
        scene.remove(entry.mesh);
        instanced.delete(cacheKey);
      }
    }

    // Remove stale slots (objects that moved from instanced → single or removed)
    for (const [name] of slots) {
      if (!incomingNames.has(name)) {
        slots.delete(name);
      }
    }
  }, [sceneData, texData, geoBuffers]);

  return (
    <group>
      {/*  */}

      {/*  */}
    </group>
  );
}
