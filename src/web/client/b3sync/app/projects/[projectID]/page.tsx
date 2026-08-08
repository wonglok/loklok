"use client";

import { CameraSync } from "../../../components/blender/CameraSync";
import { CanvasGPU } from "../../../components/blender/CanvasGPU";
import { Sidebar } from "../../../components/blender/Sidebar";
import { SyncViewer } from "../../../components/blender/SyncViewer";
import { useBlenderSyncStore } from "../../../components/stores/blenderSyncStore";
import { useBlenderStore } from "../../../components/stores/blenderStore";
import { useSettingsStore } from "../../../components/stores/settingsStore";
import { useProjectStore } from "../../../components/stores/projectStore";
import { LoadingScreen } from "../../../components/workspace/LoadingScreen";
import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";

const AUTOSAVE_DEBOUNCE_MS = 5000;

export function SceneSyncEditor() {
  const disconnect = useBlenderSyncStore((s) => s.disconnect);

  // ------------------------------------------------------------------
  // Project ID from the URL
  // ------------------------------------------------------------------
  const { projectID } = useParams<{ projectID: string }>();

  const setProjectID = useProjectStore((s) => s.setProjectID);

  // Sync projectID with the store
  useEffect(() => {
    if (projectID) {
      setProjectID(projectID);
    }
  }, [projectID, setProjectID]);

  // Hydrate persisted settings from localStorage on the client (SSR-safe)
  const hydrate = useSettingsStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // ------------------------------------------------------------------
  // Load saved data from OPFS on mount, then connect WebSocket
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!projectID) return;

    let cancelled = false;

    async function init() {
      // Try loading saved data from OPFS first
      await useProjectStore.getState().load();

      if (cancelled) return;

      // Connect to Blender for live sync (whether or not we had saved data)
      const connectFn = useBlenderSyncStore.getState().connect;
      connectFn();
    }

    init();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [projectID]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Autosave — debounced save whenever scene data or geometry changes
  // ------------------------------------------------------------------
  const objectCount = useBlenderStore((s) => s.sceneData.objects.length);
  const geoCount = useBlenderStore((s) => s.geoBuffers.size);
  const texCount = useBlenderStore((s) => s.texData.size);
  const hdrVersion = useBlenderStore((s) => s.hdrData?.pixels?.byteLength ?? 0);
  const connectionState = useBlenderStore((s) => s.connectionState);

  const skipRef = useRef(true);

  useEffect(() => {
    // Skip the first render to avoid saving before the scene is populated
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    if (connectionState !== "connected") return;
    if (objectCount === 0) return;

    const pid = useProjectStore.getState().projectID;
    if (!pid) return;

    const timer = setTimeout(() => {
      useProjectStore.getState().save();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [objectCount, geoCount, texCount, hdrVersion, connectionState]);

  return (
    <div className="w-screen h-screen relative">
      {/* Loading overlay — shown while reading OPFS */}
      <LoadingScreen />

      <div className="h-[0px]"></div>

      <div className="w-full h-[calc(100%-0px)] flex">
        <Sidebar />
        <CanvasGPU>
          <SyncViewer />
          <CameraSync />
        </CanvasGPU>
      </div>
    </div>
  );
}
