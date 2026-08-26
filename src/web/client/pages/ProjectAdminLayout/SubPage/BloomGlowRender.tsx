"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  OpfsBrowser,
  // ProductionViewer,
  Sidebar,
} from "../../../../packages/b3-runtime/src";
import { CameraSync } from "../../../../packages/b3-runtime/src/components/blender/CameraSync";
import { CanvasGPU } from "../../../../packages/b3-runtime/src/components/blender/CanvasGPU";
import { useBlenderStore } from "../../../../packages/b3-runtime/src/components/stores/blenderStore";
import {
  BlenderConnection,
  SyncViewer,
} from "../../../../packages/b3-runtime/src/components/blender/viewers/SyncViewer";
import { opfs } from "../../../../packages/b3-runtime/src/components/utils/opfs";
// import { SSGIRender } from "../../../../packages/b3-runtime/src/components/blender/canvas-units/SSGIRender";
import { ProductionScene } from "../../../../packages/b3-runtime/src/components/blender/viewers/ProductionViewer";
import { BloomGlowRender } from "../../../../packages/b3-runtime/src/components/blender/canvas-units/BloomRender";

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
        Production Canvas ⬇️
      </div>
      <div
        className="w-full border-t border-border"
        style={{ height: `calc(100% - 20px)` }}
      >
        <OutputPreview></OutputPreview>
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
        Blender Canvas ⬇️
      </div>
      <div className="w-full" style={{ height: `calc(100% - 20px)` }}>
        <CanvasGPU>
          <SyncViewer />
          <CameraSync />
          {/* <SSGIRender
            params={{
              sliceCount: 2,
              stepCount: 8,
              giIntensity: 15,
              radius: 50,
              backfaceLighting: 1,
            }}
          /> */}
          {<BloomGlowRender></BloomGlowRender>}
        </CanvasGPU>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OutputPreview — loads the deployment zip from OPFS and renders it
// ---------------------------------------------------------------------------

function OutputPreview({ children }: { children?: ReactNode }) {
  const deploymentVersion = useBlenderStore((s) => s.deploymentVersion);
  const [zipBuffer, setZipBuffer] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id, setID] = useState("");
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const buf = await opfs.readDeployment();
        if (cancelled) return;
        setZipBuffer(buf);
        setID(`_${buf?.byteLength}`);
        if (!buf) setError(null); // not an error, just nothing deployed yet
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load deployment",
        );
        setZipBuffer(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [deploymentVersion]);

  // Loading
  if (loading && !zipBuffer) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-primary/50 text-text-muted text-xs font-mono">
        <span>Loading deployment…</span>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-primary/50 text-status-red text-xs font-mono">
        <span>{error}</span>
      </div>
    );
  }

  // Empty — no deployment yet
  if (!zipBuffer) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-surface-primary/50 text-text-muted text-xs font-mono">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-40"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <span className="opacity-60">
          No deployment yet — save a snapshot to preview the optimised scene.
        </span>
      </div>
    );
  }

  // Ready — render production view

  return (
    <>
      <div className="w-full h-full">
        <CanvasGPU>
          <CameraSync />

          {zipBuffer && (
            <ProductionScene key={id} zipBuffer={zipBuffer}></ProductionScene>
          )}

          {/* <SSGIRender
            params={{
              sliceCount: 2,
              stepCount: 8,
              giIntensity: 15,
              radius: 50,
              backfaceLighting: 1,
            }}
          /> */}
          {<BloomGlowRender></BloomGlowRender>}

          {children}
        </CanvasGPU>
      </div>
    </>
  );
}

//
//
//
