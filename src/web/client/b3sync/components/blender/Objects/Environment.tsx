"use client";

import { useEffect } from "react";
import * as THREE from "three/webgpu";
import { useThree } from "@react-three/fiber";
import { HDRLoader } from "three/examples/jsm/Addons.js";
import { useBlenderStore } from "../../stores/blenderStore";

// ---------------------------------------------------------------------------
// Environment — applies the HDR environment map and intensity from Blender.
// HDR data is pushed proactively by the plugin via WebSocket after connect,
// so no explicit request is needed.
// ---------------------------------------------------------------------------

export function Environment() {
  const hdrData = useBlenderStore((s) => s.hdrData);
  const hdrIntensity = useBlenderStore((s) => s.hdrIntensity);

  const scene = useThree((r) => r.scene);
  const gl = useThree((r) => r.gl);

  // ---- HDR environment map (only when raw HDR bytes change) ----
  useEffect(() => {
    const renderer = gl;
    if (!renderer || !scene) return;

    if (!hdrData || hdrData.width === 0) {
      scene.environment = null;
      scene.background = new THREE.Color("#f4f4f4");
      return;
    }

    // The Blender plugin sends the raw HDR file bytes (RGBE-encoded).
    // HDRLoader.parse() decodes them into raw tex data. We create a
    // DataTexture from that data.
    const hdrLoader = new HDRLoader();
    const texData = hdrLoader.parse(hdrData.bytes);
    const texture = new THREE.DataTexture(
      texData.data,
      texData.width,
      texData.height,
      texData.format,
      texData.type,
    );
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;

    const pmremGenerator = new THREE.PMREMGenerator(renderer as any);
    pmremGenerator.compileEquirectangularShader();
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;

    scene.environment = envMap;
    scene.background = texture;

    texture.dispose();
    pmremGenerator.dispose();
  }, [hdrData?.bytes.byteLength, scene, gl]);

  // ---- Environment intensity (updated independently, no PMREM rebuild) ----
  useEffect(() => {
    if (!scene) return;
    scene.environmentIntensity = hdrIntensity;
  }, [hdrIntensity, scene]);

  return null;
}
