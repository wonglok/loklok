"use client";

import { PulseIcon } from "../../../../components/Icons";
import { OpfsBrowser, Sidebar } from "../../../../packages/b3-runtime/src";
import { CameraSync } from "../../../../packages/b3-runtime/src/components/blender/CameraSync";
import { CanvasGPU } from "../../../../packages/b3-runtime/src/components/blender/CanvasGPU";
import { BloomGlowRender } from "../../../../packages/b3-runtime/src/components/blender/canvas-units/BloomRender";
import { useBlenderStore } from "../../../../packages/b3-runtime/src/components/stores/blenderStore";
import {
  BlenderConnection,
  SyncContent,
  SyncLighting,
} from "../../../../packages/b3-runtime/src/components/blender/viewers/SyncViewer";

// ---------------------------------------------------------------------------
// RealtimeCanvasViewport — the live Blender sync canvas.
//
// Drops a WebGPU canvas into the page and streams the current Blender scene:
// meshes, textures, lighting/HDR and camera all update in real time as the
// add-on sends snapshots over the WebSocket. Pure canvas — no page chrome.
// ---------------------------------------------------------------------------

export function RealtimeCanvasViewport() {
  return (
    <CanvasGPU>
      <SyncContent />
      <SyncLighting />
      <CameraSync />
      <BloomGlowRender />
    </CanvasGPU>
  );
}

// ---------------------------------------------------------------------------
// RealtimeCanvas — full page wrapper around the live sync viewport.
// ---------------------------------------------------------------------------

export function RealtimeCanvas() {
  // Bumped by every snapshot — re-reads the OPFS tree so the space freed by
  // pruning is actually visible after pressing save.
  const deploymentVersion = useBlenderStore((s) => s.deploymentVersion);

  return (
    <div className="relative w-full h-full">
      <div className="w-full h-full flex">
        {/* Establish the Blender WebSocket connection while this page is open. */}
        <BlenderConnection></BlenderConnection>

        <div className="w-full h-full flex flex-col">
          <div
            className="text-xs flex items-center justify-center gap-1.5"
            style={{ height: "20px" }}
          >
            <PulseIcon className="w-3.5 h-3.5" />
            Realtime Canvas
          </div>
          <div className="w-full" style={{ height: `calc(100% - 20px)` }}>
            <RealtimeCanvasViewport></RealtimeCanvasViewport>
          </div>
        </div>

        <Sidebar
          bottomRow={
            <>
              {/* ---- OPFS Browser ---- */}
              <div className="px-3.5 py-2.5 border-t border-border h-100 overflow-y-scroll">
                <OpfsBrowser refreshKey={deploymentVersion} />
              </div>
            </>
          }
        ></Sidebar>
      </div>
    </div>
  );
}
