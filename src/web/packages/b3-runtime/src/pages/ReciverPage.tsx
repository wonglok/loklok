"use client";

import { CameraSync } from "../components/blender/CameraSync";
import { CanvasGPU } from "../components/blender/CanvasGPU";
import { Sidebar } from "../components/blender/Sidebar";
import {
  BlenderConnection,
  SyncViewer,
} from "../components/blender/viewers/SyncViewer";

export function ReceiverPage() {
  return (
    <div className="w-full h-full relative">
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
