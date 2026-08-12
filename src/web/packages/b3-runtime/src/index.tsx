"use client";

import { CameraSync } from "./components/blender/CameraSync";
import { CanvasGPU } from "./components/blender/CanvasGPU";
import { Sidebar } from "./components/blender/Sidebar";
import {
  BlenderConnection,
  RefreshButton,
  SyncViewer,
} from "./components/blender/viewers/SyncViewer";
import { OpfsBrowser } from "./components/blender/OpfsBrowser";
import { ProductionViewer } from "./components/blender/viewers/ProductionViewer";

// components
export {
  Sidebar,
  BlenderConnection,
  CanvasGPU,
  SyncViewer,
  CameraSync,
  RefreshButton,
  OpfsBrowser,
  ProductionViewer,
};

// pages

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

// OPFS SDK
export {
  opfs,
  OpfsFS,
  opfsOptimiser,
  OpfsOptimiser,
  detectCapabilities,
} from "./components/utils/opfs";

//
