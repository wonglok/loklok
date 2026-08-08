"use client";

import { useBlenderStore } from "../stores/blenderStore";
import type { ConnectionState } from "../types/blenderTypes";
import { Link } from "react-router-dom";

// ---------------------------------------------------------------------------
// Sidebar — left panel with sync controls and status info
// ---------------------------------------------------------------------------

const stateConfig: Record<ConnectionState, { color: string; label: string }> = {
  disconnected: { color: "bg-gray-500", label: "Disconnected" },
  connecting: { color: "bg-yellow-500", label: "Connecting…" },
  connected: { color: "bg-green-500", label: "Connected" },
  error: { color: "bg-red-500", label: "Error" },
};

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

function CameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function RadioIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
export function Sidebar() {
  const connectionState = useBlenderStore((s) => s.connectionState);
  const objectCount = useBlenderStore((s) => s.sceneData.objects.length);
  const cameraData = useBlenderStore((s) => s.cameraData);
  const sceneCameras = useBlenderStore((s) => s.cameras);
  const selectedCamera = useBlenderStore((s) => s.selectedCamera);
  const selectCamera = useBlenderStore((s) => s.selectCamera);

  const config = stateConfig[connectionState];
  const isConnected = connectionState === "connected";

  return (
    <div
      className="
        h-full w-[300px]
        bg-surface-primary/95 backdrop-blur-md
        border-r border-border
        text-text-primary text-xs font-mono
        flex flex-col
        overflow-hidden
      "
    >
      {/* ---- Header ---- */}
      <div className="flex items-center gap-2 px-3.5 py-3 border-b border-border">
        <span className="text-text-muted">
          <RadioIcon />
        </span>
        <span className="text-sm font-semibold tracking-wide text-text-primary flex-1">
          Sync Panel
        </span>
      </div>

      <div className="p-2">
        {/* Home button */}
        <Link
          to="/"
          className="
          inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
          text-[10px] font-mono text-text-muted
          bg-surface-primary/90 backdrop-blur-sm border border-border
          hover:text-text-primary hover:bg-surface-secondary
          transition-all duration-150
        "
          title="Home"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Back
        </Link>
      </div>

      {/* ---- Body ---- */}
      <div className="flex-1 flex flex-col gap-3 px-3.5 py-3 overflow-y-auto">
        {/* Connection status */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">
            Connection
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${config.color}`}
            />
            <span className="text-text-secondary">{config.label}</span>
          </div>
        </div>

        {/* Object count */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">
            Scene
          </div>
          <div className="flex items-center gap-2 text-text-secondary">
            <CubeIcon />
            <span>
              {isConnected ? (
                <>
                  <span className="text-text-primary font-semibold">
                    {objectCount}
                  </span>{" "}
                  objects
                </>
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>

        {/* Camera Sync */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">
            Camera
          </div>

          {/* Camera detail when syncing */}
          {isConnected && cameraData && (
            <div className="mt-1 space-y-0.5 pl-2 text-[10px] text-text-muted leading-relaxed">
              <div className="flex justify-between">
                <span>FOV</span>
                <span className="text-text-secondary tabular-nums">
                  {cameraData.ortho ? "ortho" : `${cameraData.fov}°`}
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted/70 mt-1">
                Position
              </div>
              <div className="flex justify-between">
                <span>X</span>
                <span className="text-text-secondary tabular-nums">
                  {cameraData.position[0].toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Y</span>
                <span className="text-text-secondary tabular-nums">
                  {cameraData.position[1].toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Z</span>
                <span className="text-text-secondary tabular-nums">
                  {cameraData.position[2].toFixed(2)}
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted/70 mt-1">
                Rotation
              </div>
              <div className="flex justify-between">
                <span>X</span>
                <span className="text-text-secondary tabular-nums">
                  {((cameraData.euler[0] * 180) / Math.PI).toFixed(1)}°
                </span>
              </div>
              <div className="flex justify-between">
                <span>Y</span>
                <span className="text-text-secondary tabular-nums">
                  {((cameraData.euler[1] * 180) / Math.PI).toFixed(1)}°
                </span>
              </div>
              <div className="flex justify-between">
                <span>Z</span>
                <span className="text-text-secondary tabular-nums">
                  {((cameraData.euler[2] * 180) / Math.PI).toFixed(1)}°
                </span>
              </div>
            </div>
          )}

          {isConnected && !cameraData && (
            <div className="text-[10px] text-status-yellow/80 pl-2">
              Waiting for viewport data…
            </div>
          )}

          {/* Scene cameras list */}
          {isConnected && sceneCameras.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                Scene Cameras ({sceneCameras.length})
              </div>
              {sceneCameras.map((cam) => {
                const isSelected = selectedCamera?.name === cam.name;
                return (
                  <button
                    key={cam.name}
                    onClick={() => selectCamera(isSelected ? null : cam)}
                    className={`
                      w-full text-left pl-2 pr-1.5 py-1.5 rounded
                      text-[10px] leading-relaxed
                      transition-all duration-150
                      ${
                        isSelected
                          ? "bg-accent-subtle border border-accent/30"
                          : cam.isActive
                            ? "bg-status-green/10 border border-status-green/20 hover:bg-status-green/15"
                            : "bg-surface-secondary border border-transparent hover:bg-surface-tertiary hover:border-border"
                      }
                    `}
                  >
                    <div className="flex items-center gap-1.5">
                      {cam.isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-status-green shrink-0" />
                      )}
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      )}
                      {!cam.isActive && !isSelected && (
                        <span className="w-1.5 h-1.5 shrink-0" />
                      )}
                      <span
                        className={`truncate ${
                          isSelected ? "text-accent" : "text-text-secondary"
                        }`}
                      >
                        {cam.name}
                      </span>
                    </div>
                    <div className="flex justify-between text-text-muted mt-0.5">
                      <span>{cam.ortho ? "Ortho" : `${cam.fov}°`}</span>
                      <span>
                        {cam.position[0].toFixed(1)},{" "}
                        {cam.position[1].toFixed(1)},{" "}
                        {cam.position[2].toFixed(1)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {isConnected && sceneCameras.length === 0 && (
            <div className="text-[10px] text-text-muted/60 pl-2 mt-1">
              No scene cameras
            </div>
          )}
        </div>
      </div>

      {/* ---- Footer ---- */}
      <div className="px-3.5 py-2.5 border-t border-border text-[10px] text-text-muted/60">
        BlenderTalk Sync
      </div>
    </div>
  );
}
