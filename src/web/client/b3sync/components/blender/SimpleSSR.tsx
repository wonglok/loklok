"use client";

import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import {
  pass,
  mrt,
  output,
  normalView,
  sample,
  packNormalToRGB,
  unpackRGBToNormal,
  vec2,
  roughness,
  metalness,
} from "three/tsl";
import { ssr } from "three/addons/tsl/display/SSRNode.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";
import { RoomEnvironment } from "three/examples/jsm/Addons.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SimpleSSR() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const pipelineRef = useRef<THREE.RenderPipeline | null>(null);
  const needsSetup = useRef(true);

  // ------------------------------------------------------------------
  // Build SSR pipeline once
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!needsSetup.current) return;
    needsSetup.current = false;

    // Procedural indoor environment
    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    scene.environment = pmremGenerator.fromScene(environment, 0.04).texture;
    scene.environmentIntensity = 1.25;
    pmremGenerator.dispose();

    // Render pipeline with MRT
    const renderPipeline = new THREE.RenderPipeline(gl);
    pipelineRef.current = renderPipeline;

    const scenePass = pass(scene, camera);
    scenePass.setMRT(
      mrt({
        output: output,
        normal: packNormalToRGB(normalView),
        metalrough: vec2(metalness, roughness),
      }),
    );

    // Extract texture nodes
    const scenePassColor = scenePass.getTextureNode("output");
    const scenePassNormal = scenePass.getTextureNode("normal");
    const scenePassDepth = scenePass.getTextureNode("depth");
    const scenePassMetalRough = scenePass.getTextureNode("metalrough");

    // Optimize bandwidth: reduce texture precision for normals and metal/roughness
    const normalTexture = scenePass.getTexture("normal");
    normalTexture.type = THREE.UnsignedByteType;

    const metalRoughTexture = scenePass.getTexture("metalrough");
    metalRoughTexture.type = THREE.UnsignedByteType;

    // Reconstructed screen-space normal
    const sceneNormal = sample((uv) =>
      unpackRGBToNormal(scenePassNormal.sample(uv)),
    );

    // SSR
    const ssrPass = ssr(scenePassColor, scenePassDepth, sceneNormal, {
      metalnessNode: scenePassMetalRough.r,
      roughnessNode: scenePassMetalRough.g,
    });

    // Blend SSR over scene color (SSR outputs premultiplied → additive blend)
    // Apply SMAA for anti-aliasing
    const outputNode = smaa(scenePassColor.add(ssrPass.rgb));
    renderPipeline.outputNode = outputNode;

    return () => {
      renderPipeline.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Render pipeline each frame
  // ------------------------------------------------------------------
  useFrame(() => {
    pipelineRef.current?.render();
  }, 1);

  return null;
}
