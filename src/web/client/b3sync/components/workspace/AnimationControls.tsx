"use client";

import { useEffect, useState } from "react";
import { useBlenderStore } from "../stores/blenderStore";
import {
  getPlaybackState,
  setPlaybackState,
  subscribePlayback,
} from "../blender/AnimationController";

// ---------------------------------------------------------------------------
// AnimationControls — play/pause, scrubber, speed, clip selector
// Mounted inside the Sidebar.
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <rect x="4" y="4" width="16" height="16" rx="1" />
    </svg>
  );
}

export function AnimationControls() {
  const animations = useBlenderStore((s) => s.animations);
  const [state, setState] = useState(getPlaybackState());

  useEffect(() => {
    return subscribePlayback(setState);
  }, []);

  if (animations.length === 0) return null;

  const activeClip = state.activeClip;
  const duration = state.duration || 1;
  const currentTime = state.currentTime;

  const handlePlayPause = () => {
    setPlaybackState({ playing: !state.playing });
  };

  const handleStop = () => {
    setPlaybackState({ playing: false, currentTime: 0 });
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setPlaybackState({ currentTime: t, playing: false });
  };

  const handleSpeed = (speed: number) => {
    setPlaybackState({ speed });
  };

  const handleSelectClip = (name: string) => {
    const clipDur =
      animations.find((a) => a.name === name)?.channels.reduce(
        (max, ch) =>
          ch.times.length > 0 ? Math.max(max, ch.times[ch.times.length - 1]) : max,
        0,
      ) ?? 1;

    setPlaybackState({
      activeClip: name,
      duration: clipDur,
      currentTime: 0,
      playing: false,
    });
  };

  const speeds = [0.25, 0.5, 1, 2];

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-text-muted">
        Animation
      </div>

      {/* Clip selector */}
      <select
        value={activeClip ?? ""}
        onChange={(e) => handleSelectClip(e.target.value)}
        className="
          w-full px-2 py-1.5 rounded-md
          bg-surface-secondary border border-border
          text-text-secondary text-[10px] font-mono
          focus:outline-none focus:border-accent/40
          transition-colors
        "
      >
        {animations.map((a) => (
          <option key={a.name} value={a.name}>
            {a.name}
          </option>
        ))}
      </select>

      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={handlePlayPause}
          className="
            flex items-center justify-center w-8 h-8 rounded-md
            border border-border bg-surface-secondary
            text-text-secondary hover:text-accent
            hover:bg-accent-subtle hover:border-accent/20
            transition-all duration-150
          "
          title={state.playing ? "Pause" : "Play"}
        >
          {state.playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button
          onClick={handleStop}
          className="
            flex items-center justify-center w-8 h-8 rounded-md
            border border-border bg-surface-secondary
            text-text-muted hover:text-text-secondary
            hover:bg-surface-tertiary
            transition-all duration-150
          "
          title="Stop"
        >
          <StopIcon />
        </button>

        {/* Speed buttons */}
        <div className="flex items-center gap-0.5 ml-1">
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => handleSpeed(s)}
              className={`
                px-1.5 py-0.5 rounded text-[9px] font-mono
                transition-all duration-150
                ${
                  state.speed === s
                    ? "text-accent bg-accent-subtle border border-accent/30"
                    : "text-text-muted border border-transparent hover:text-text-secondary hover:bg-surface-secondary"
                }
              `}
            >
              {s}x
            </button>
          ))}
        </div>
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
          onChange={handleScrub}
          className="
            flex-1 h-1 appearance-none rounded-full
            bg-surface-tertiary
            accent-accent
            cursor-pointer
          "
        />
        <span className="text-[10px] text-text-muted tabular-nums w-10">
          {duration.toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
