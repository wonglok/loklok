"use client";

import { OpfsBrowser, Sidebar } from "../../../../packages/b3-runtime/src";
import { useBlenderStore } from "../../../../packages/b3-runtime/src/components/stores/blenderStore";
import { BlenderConnection } from "../../../../packages/b3-runtime/src/components/blender/viewers/SyncViewer";
import { ProductionCanvasViewport } from "./ProductionCanvas";
import { RealtimeCanvasViewport } from "./RealtimeCanvas";

export function BlenderReceiver() {
  // Bumped by every snapshot — re-reads the OPFS tree so the space freed by
  // pruning is actually visible after pressing save.
  const deploymentVersion = useBlenderStore((s) => s.deploymentVersion);

  return (
    <div className="relative w-full h-full">
      <div className="w-full h-full flex">
        <BlenderConnection></BlenderConnection>
        <div className="w-full h-full flex">
          <BlenderReceivingCanvas></BlenderReceivingCanvas>
          <ProductionCanvas></ProductionCanvas>
        </div>
        <Sidebar
          bottomRow={
            <>
              {/* ---- OPFS Browser ---- */}
              <div className="px-3.5 py-2.5 border-t border-border h-[400px] overflow-y-scroll">
                <OpfsBrowser refreshKey={deploymentVersion} />
              </div>
            </>
          }
        ></Sidebar>
      </div>
    </div>
  );
}

function ProductionCanvas() {
  return (
    <div className="w-full h-full">
      <div
        className="text-xs flex items-center justify-center"
        style={{ height: `calc(20px)` }}
      >
        Production Canvas
      </div>
      <div
        className="w-full border-t border-border"
        style={{ height: `calc(100% - 20px)` }}
      >
        <ProductionCanvasViewport></ProductionCanvasViewport>
      </div>
    </div>
  );
}

function BlenderReceivingCanvas() {
  return (
    <div className="w-full h-full">
      <div
        className="text-xs flex items-center justify-center"
        style={{ height: "20px" }}
      >
        Development Canvas
      </div>
      <div className="w-full" style={{ height: `calc(100% - 20px)` }}>
        <RealtimeCanvasViewport></RealtimeCanvasViewport>
      </div>
    </div>
  );
}
