"use client";

import { CameraSync } from "../components/blender/CameraSync";
import { CanvasGPU } from "../components/blender/CanvasGPU";
import { Sidebar } from "../components/blender/Sidebar";
import {
  BlenderConnection,
  SyncViewer,
} from "../components/blender/SyncViewer";

export function ReceiverPage() {
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
