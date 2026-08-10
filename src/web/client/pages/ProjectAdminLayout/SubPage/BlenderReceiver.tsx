"use client";

import { CameraSync } from "../../../../packages/b3-runtime/src/components/blender/CameraSync";
import { CanvasGPU } from "../../../../packages/b3-runtime/src/components/blender/CanvasGPU";
// import { Sidebar } from "../../packages/b3-runtime/src/components/blender/Sidebar";
import {
  BlenderConnection,
  RefreshButton,
  SyncViewer,
} from "../../../../packages/b3-runtime/src/components/blender/SyncViewer";
import { useBlenderSyncStore } from "../../../../packages/b3-runtime/src/components/stores/blenderSyncStore";

export function BlenderReceiver() {
  return (
    <div className="relative w-full h-full">
      <div className="w-full h-full flex">
        <BlenderConnection></BlenderConnection>
        <CanvasGPU>
          <SyncViewer />
          <CameraSync />
        </CanvasGPU>
      </div>
      <div className=" absolute top-0 left-0">
        <div className="">
          <RefreshButton></RefreshButton>
          <button className="block px-3 py-1 text-white text-sm bg-blue-500 rounded-lg m-1">
            Import to 3D Envrionment
          </button>
          <button className="block px-3 py-1 text-white text-sm bg-blue-500 rounded-lg m-1">
            Import to 3D Props
          </button>
        </div>
      </div>
    </div>
  );
}
