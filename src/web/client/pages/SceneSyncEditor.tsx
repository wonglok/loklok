"use client";

import { CameraSync } from "../b3sync/components/blender/CameraSync";
import { CanvasGPU } from "../b3sync/components/blender/CanvasGPU";
import { Sidebar } from "../b3sync/components/blender/Sidebar";
import { SyncViewer } from "../b3sync/components/blender/SyncViewer";
import { useBlenderSyncStore } from "../b3sync/components/stores/blenderSyncStore";
import { useSettingsStore } from "../b3sync/components/stores/settingsStore";
import { useEffect } from "react";

export function SceneSyncEditor() {
  const disconnect = useBlenderSyncStore((s) => s.disconnect);

  // Hydrate persisted settings from localStorage on the client (SSR-safe)
  const hydrate = useSettingsStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Connect to Blender WebSocket on mount, disconnect on unmount
  useEffect(() => {
    const connectFn = useBlenderSyncStore.getState().connect;
    connectFn();

    return () => {
      disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-screen h-screen relative">
      <div className="w-full h-full flex">
        <Sidebar />
        <CanvasGPU>
          <SyncViewer />
          <CameraSync />
        </CanvasGPU>
      </div>
    </div>
  );
}
