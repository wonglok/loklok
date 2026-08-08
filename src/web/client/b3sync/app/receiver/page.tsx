"use client";

import { CameraSync } from "../../components/blender/CameraSync";
import { CanvasGPU } from "../../components/blender/CanvasGPU";
import { Sidebar } from "../../components/blender/Sidebar";
import { SyncViewer } from "../../components/blender/SyncViewer";
import { useBlenderSyncStore } from "../../components/stores/blenderSyncStore";
import { useSettingsStore } from "../../components/stores/settingsStore";
import { OrbitControls } from "@react-three/drei";
import { useEffect } from "react";

export function SceneSyncEditor() {
  const cameraSyncOn = useSettingsStore((s) => s.cameraSyncOn);

  // Connect WebSocket on mount, disconnect on unmount
  useEffect(() => {
    const disconnectFn = useBlenderSyncStore.getState().disconnect;
    const connectFn = useBlenderSyncStore.getState().connect;
    connectFn();
    return () => {
      disconnectFn();
    };
  }, []);

  return (
    <div className="w-screen h-screen relative">
      <div className="h-[0px]"></div>

      <div className="w-full h-[calc(100%-0px)] flex">
        <Sidebar />
        <CanvasGPU>
          <SyncViewer />
          <CameraSync />

          {!cameraSyncOn && <OrbitControls target={[0, 1, 0]} makeDefault />}
        </CanvasGPU>
      </div>
    </div>
  );
}
