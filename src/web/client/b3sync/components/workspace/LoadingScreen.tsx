"use client";

import { useProjectStore } from "../stores/projectStore";

// ---------------------------------------------------------------------------
// Loading screen — full-screen overlay shown while loading saved project data
// ---------------------------------------------------------------------------

function SpinnerIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function LoadingScreen() {
  const isLoading = useProjectStore((s) => s.isLoading);
  const progress = useProjectStore((s) => s.loadProgress);
  const projectID = useProjectStore((s) => s.projectID);
  const loadError = useProjectStore((s) => s.loadError);

  if (!isLoading) return null;

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-primary/95 backdrop-blur-sm">
      <div
        className="
          flex flex-col items-center gap-5
          w-[360px] px-8 py-10
          bg-surface-primary shadow-lg
          border border-border rounded-xl
          text-text-primary font-mono text-xs
        "
      >
        {/* Spinner */}
        <div className="text-text-muted">
          <SpinnerIcon />
        </div>

        {/* Project label */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">
            Project
          </div>
          <div className="text-sm font-semibold text-text-primary">
            {projectID ?? "Loading…"}
          </div>
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="w-full space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-surface-tertiary overflow-hidden">
              <div
                className="h-full rounded-full bg-accent/60 transition-all duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-center text-[10px] text-text-muted">
              {progress.label}
            </div>
          </div>
        )}

        {/* Error state */}
        {loadError && (
          <div className="text-center text-[10px] text-status-red/80 max-w-[260px]">
            {loadError}
          </div>
        )}
      </div>
    </div>
  );
}
