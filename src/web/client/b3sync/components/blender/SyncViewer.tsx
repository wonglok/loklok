"use client";

import { Environment } from "./Objects/Environment";
import { Lights } from "./Objects/Lights";
import { Meshes } from "./Objects/Meshes";

// ---------------------------------------------------------------------------
// SyncViewer — orchestrates Blender scene objects into the Three.js scene.
// Delegates to sub-components for HDR environment, lights, and meshes.
// ---------------------------------------------------------------------------

export function SyncViewer() {
  return (
    <group>
      <Environment />
      <Lights />
      <Meshes />
    </group>
  );
}
