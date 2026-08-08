"use client";

import { useEffect } from "react";
import * as THREE from "three/webgpu";
import { useThree } from "@react-three/fiber";
import { HDRLoader } from "three/examples/jsm/Addons.js";
import { useBlenderStore } from "../../stores/blenderStore";
import { useBlenderSyncStore } from "../../stores/blenderSyncStore";

// ---------------------------------------------------------------------------
// Environment — applies the HDR environment map and intensity from Blender.
// Requests HDR on connect.
// ---------------------------------------------------------------------------

let _hdrRequested = false;

export function Environment() {
  const hdrData = useBlenderStore((s) => s.hdrData);
  const hdrIntensity = useBlenderStore((s) => s.hdrIntensity);
  const connectionState = useBlenderStore((s) => s.connectionState);

  const scene = useThree((r) => r.scene);
  const gl = useThree((r) => r.gl);

  const send = useBlenderSyncStore((s) => s.send);

  // ---- Request HDR on connect ----
  useEffect(() => {
    if (connectionState === "connected" && !_hdrRequested) {
      _hdrRequested = true;
      send({ type: "request-hdr" });
    }
  }, [connectionState, send]);

  // ---- HDR environment map (only when pixel data changes) ----
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

  // ---- Environment intensity (updated independently, no PMREM rebuild) ----
  useEffect(() => {
    if (!scene) return;
    scene.environmentIntensity = hdrIntensity;
  }, [hdrIntensity, scene]);

  return null;
}
