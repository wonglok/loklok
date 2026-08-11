"use client";

import { Sidebar } from "../../../../packages/b3-runtime/src";
import { CameraSync } from "../../../../packages/b3-runtime/src/components/blender/CameraSync";
import { CanvasGPU } from "../../../../packages/b3-runtime/src/components/blender/CanvasGPU";
import { OpfsBrowser } from "../../../../packages/b3-runtime/src/components/blender/OpfsBrowser";
// import { Sidebar } from "../../packages/b3-runtime/src/components/blender/Sidebar";
import {
  BlenderConnection,
  SyncViewer,
} from "../../../../packages/b3-runtime/src/components/blender/SyncViewer";

export function BlenderReceiver() {
  return (
    <div className="relative w-full h-full">
      <div className="w-full h-full flex">
        <BlenderConnection></BlenderConnection>
        <div className="w-full h-full">
          <div className="w-full h-1/2">
            <CanvasGPU>
              <SyncViewer />
              <CameraSync />
            </CanvasGPU>
          </div>
          <div className="w-full h-1/2">
            <OpfsBrowser></OpfsBrowser>
          </div>
        </div>
        <Sidebar></Sidebar>
      </div>
      <div className=" absolute top-0 left-0">
        <div className="">
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

//
