"use client";

import { CameraSync } from "../../packages/b3-runtime/src/components/blender/CameraSync";
import { CanvasGPU } from "../../packages/b3-runtime/src/components/blender/CanvasGPU";
import { Sidebar } from "../../packages/b3-runtime/src/components/blender/Sidebar";
import {
  BlenderConnection,
  SyncViewer,
} from "../../packages/b3-runtime/src/components/blender/SyncViewer";

export function BlenderReceiver() {
  return (
    <div className="w-screen h-screen relative">
      <div className="w-full h-full flex">
        <Sidebar />
        <BlenderConnection></BlenderConnection>
        <CanvasGPU>
          <SyncViewer />
          <CameraSync />
        </CanvasGPU>
      </div>
    </div>
  );
}
