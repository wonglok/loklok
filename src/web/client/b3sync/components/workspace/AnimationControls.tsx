"use client";

import { useEffect, useState } from "react";
import {
  getPlaybackState,
  setPlaybackState,
  subscribePlayback,
} from "../blender/AnimationController";
import { useBlenderStore } from "../stores/blenderStore";

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------
function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="6,3 20,12 6,21" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="4" y="4" width="16" height="16" rx="1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AnimationControls() {
  const animationGlb = useBlenderStore((s) => s.animationGlb);
  const [pb, setPb] = useState(getPlaybackState());

  useEffect(() => subscribePlayback(setPb), []);

  // Build clip list from the AnimationController's actions
  const [clipNames, setClipNames] = useState<string[]>([]);
  const hasGlb = animationGlb !== null;

  // When GLB arrives, get clip names from playback
  useEffect(() => {
    if (hasGlb && pb.activeClip) {
      // Collect clip names — read from the module state which is set by AnimationController
      const names: string[] = [];
      // We get names from the store — the AnimationController sets activeClip
      if (pb.activeClip && !names.includes(pb.activeClip)) {
        names.push(pb.activeClip);
      }
      // Actually, re-read from playback on each render
      const s = getPlaybackState();
      if (s.activeClip && !names.includes(s.activeClip)) {
        names.push(s.activeClip);
      }
      setClipNames(names.length > 0 ? names : [pb.activeClip ?? "Animation"]);
    }
  }, [hasGlb, pb.activeClip]);

  if (!hasGlb) return null;

  const activeClip = pb.activeClip;
  const duration = pb.duration || 1;
  const currentTime = pb.currentTime;
  const isPlaying = pb.playing && activeClip !== null;

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-text-muted">
        Animation
      </div>

      {/* Transport */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPlaybackState({ playing: !pb.playing })}
          className="
            flex items-center justify-center w-8 h-8 rounded-md
            border border-border bg-surface-secondary
            text-text-secondary hover:text-accent
            hover:bg-accent-subtle hover:border-accent/20
            transition-all duration-150
          "
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button
          onClick={() => setPlaybackState({ playing: false, currentTime: 0 })}
          className="
            flex items-center justify-center w-8 h-8 rounded-md
            border border-border bg-surface-secondary
            text-text-muted hover:text-text-secondary
            hover:bg-surface-tertiary transition-all duration-150
          "
          title="Stop"
        >
          <StopIcon />
        </button>

        {/* Speed */}
        {[0.25, 0.5, 1, 2].map((s) => (
          <button
            key={s}
            onClick={() => setPlaybackState({ speed: s })}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-all duration-150 ${
              pb.speed === s
                ? "text-accent bg-accent-subtle border border-accent/30"
                : "text-text-muted border border-transparent hover:text-text-secondary hover:bg-surface-secondary"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Scrubber */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-muted tabular-nums w-10 text-right">
          {currentTime.toFixed(1)}s
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={currentTime}
          onChange={(e) =>
            setPlaybackState({ currentTime: parseFloat(e.target.value) })
          }
          className="flex-1 h-1 appearance-none rounded-full bg-surface-tertiary accent-accent cursor-pointer"
        />
        <span className="text-[10px] text-text-muted tabular-nums w-10">
          {duration.toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
