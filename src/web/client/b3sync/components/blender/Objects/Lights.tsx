"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { useThree } from "@react-three/fiber";
import { useBlenderStore } from "../../stores/blenderStore";

// ---------------------------------------------------------------------------
// Module-level light tracker
// ---------------------------------------------------------------------------
const lightsRef: { current: THREE.Light[] } = { current: [] };

// ---------------------------------------------------------------------------
// Lights — syncs Blender light objects into the Three.js scene
// ---------------------------------------------------------------------------

export function Lights() {
  const lights = useBlenderStore((s) => s.lights);
  const scene = useThree((r) => r.scene);
  const sceneRef = useRef<THREE.Scene | null>(scene);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;

    // Remove any previously synced lights from the scene
    const prevLights = lightsRef.current;
    for (const l of prevLights) {
      sc.remove(l);
    }
    lightsRef.current = [];

    // Blender energy (Watts) → Three.js intensity conversion
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

      sc.add(threeLight);
      lightsRef.current.push(threeLight);
    }
  }, [lights, scene]);

  return null;
}
