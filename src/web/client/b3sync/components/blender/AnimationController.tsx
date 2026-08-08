"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { useThree, useFrame } from "@react-three/fiber";
import { useBlenderStore } from "../stores/blenderStore";
import type { AnimationClipData } from "../types/blenderTypes";

// ---------------------------------------------------------------------------
// Animation playback state — module-level so both the controller and the
// sidebar controls can read / write without a separate Zustand store.
// ---------------------------------------------------------------------------

export interface PlaybackState {
  playing: boolean;
  currentTime: number;
  speed: number;
  activeClip: string | null;
  duration: number;
}

let _playbackListeners: Array<(s: PlaybackState) => void> = [];

let _playback: PlaybackState = {
  playing: false,
  currentTime: 0,
  speed: 1.0,
  activeClip: null,
  duration: 0,
};

export function getPlaybackState(): PlaybackState {
  return _playback;
}

export function setPlaybackState(patch: Partial<PlaybackState>) {
  _playback = { ..._playback, ...patch };
  for (const fn of _playbackListeners) fn(_playback);
}

export function subscribePlayback(fn: (s: PlaybackState) => void): () => void {
  _playbackListeners.push(fn);
  return () => {
    _playbackListeners = _playbackListeners.filter((f) => f !== fn);
  };
}

/** Set of object names currently controlled by an animation clip.
 *  SyncViewer checks this to avoid fighting with the mixer. */
const _animatedObjectNames = new Set<string>();

export function setAnimatedObjectNames(names: Set<string>) {
  _animatedObjectNames.clear();
  for (const n of names) _animatedObjectNames.add(n);
}

/** True when the given object is being animated AND playback is active. */
export function shouldSkipBlenderTransform(name: string): boolean {
  return _playback.playing && _animatedObjectNames.has(name);
}

// ---------------------------------------------------------------------------
// Build a Three.js AnimationClip from wire-format AnimationClipData.
// ---------------------------------------------------------------------------
function buildClip(data: AnimationClipData): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];

  for (const ch of data.channels) {
    const times = new Float32Array(ch.times);
    const values = new Float32Array(ch.values);

    const track =
      ch.property === "quaternion"
        ? new THREE.QuaternionKeyframeTrack(
            `.${ch.property}`,
            times as any,
            values as any,
          )
        : new THREE.VectorKeyframeTrack(
            `.${ch.property}`,
            times as any,
            values as any,
          );

    track.name = `${ch.objectName}.${ch.property}`;
    tracks.push(track);
  }

  return new THREE.AnimationClip(data.name, undefined, tracks);
}

// ---------------------------------------------------------------------------
// AnimationController — drives the AnimationMixer from the store + playback
// ---------------------------------------------------------------------------
export function AnimationController() {
  const animations = useBlenderStore((s) => s.animations);
  const scene = useThree((r) => r.scene);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const clipsRef = useRef<Map<string, THREE.AnimationClip>>(new Map());
  const prevAnimHashRef = useRef("");

  // ---- Build / rebuild clips when animation data arrives from Blender ----
  useEffect(() => {
    if (!scene) return;

    // Hash to detect meaningful changes
    const hash = animations
      .map((a) => `${a.name}:${a.channels.length}`)
      .sort()
      .join("|");
    if (hash === prevAnimHashRef.current) return;
    prevAnimHashRef.current = hash;

    // Build new clips
    const newClips = new Map<string, THREE.AnimationClip>();
    for (const a of animations) {
      newClips.set(a.name, buildClip(a));
    }

    // Tear down old mixer
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current.uncacheRoot(scene);
    }

    clipsRef.current = newClips;
    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current = mixer;
    actionsRef.current.clear();

    // Track which objects are animated (for SyncViewer conflict avoidance)
    const animatedNames = new Set<string>();
    for (const a of animations) {
      for (const ch of a.channels) {
        animatedNames.add(ch.objectName);
      }
    }
    setAnimatedObjectNames(animatedNames);

    for (const clip of newClips.values()) {
      actionsRef.current.set(clip.name, mixer.clipAction(clip));
    }

    // Auto-select first clip
    const firstClip = newClips.values().next().value;
    if (firstClip) {
      setPlaybackState({
        activeClip: firstClip.name,
        duration: firstClip.duration,
        currentTime: 0,
        playing: false,
      });
    } else {
      setPlaybackState({
        activeClip: null,
        duration: 0,
        currentTime: 0,
        playing: false,
      });
    }
  }, [animations, scene]);

  // ---- Subscribe to playback changes from the sidebar ----
  const playbackRef = useRef(_playback);
  const prevActiveRef = useRef<string | null>(null);
  const prevPlayingRef = useRef(false);

  useEffect(() => {
    return subscribePlayback((next) => {
      playbackRef.current = next;
      const mixer = mixerRef.current;
      if (!mixer) return;

      const clipChanged = next.activeClip !== prevActiveRef.current;
      const toggled = next.playing !== prevPlayingRef.current;

      if (clipChanged || toggled) {
        // Stop all, reset, then restart the active clip
        mixer.stopAllAction();
        for (const [name, action] of actionsRef.current) {
          action.reset();
          if (name === next.activeClip) {
            action.play();
            action.paused = !next.playing;
          }
        }
      }

      // Apply scrub / seek via currentTime changes handled in useFrame

      mixer.timeScale = next.speed;
      prevActiveRef.current = next.activeClip;
      prevPlayingRef.current = next.playing;
    });
  }, []);

  // ---- Advance the mixer each frame ----
  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const s = playbackRef.current;

    // Handle scrub — if currentTime was set externally (by the slider),
    // seek the active action to that time
    if (s.activeClip) {
      const action = actionsRef.current.get(s.activeClip);
      if (action) {
        // If not playing, user might be scrubbing
        if (!s.playing) {
          const diff = Math.abs(action.time - s.currentTime);
          if (diff > 0.05) {
            // Significant jump — seek
            action.time = s.currentTime;
            mixer.update(0); // apply the seek
          }
        } else {
          // Playing — advance normally
          mixer.update(delta * s.speed);
          // Reflect time back to playback state for the scrubber
          if (Math.abs(action.time - getPlaybackState().currentTime) > 0.05) {
            setPlaybackState({ currentTime: action.time });
          }
        }
      }
    }
  });

  return null;
}
