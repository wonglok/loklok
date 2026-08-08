"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { useThree, useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { useBlenderStore } from "../stores/blenderStore";

// ---------------------------------------------------------------------------
// Module-level playback state — shared between AnimationController and Sidebar
// ---------------------------------------------------------------------------

export interface PlaybackState {
  playing: boolean;
  currentTime: number;
  speed: number;
  activeClip: string | null;
  duration: number;
}

let _listeners: Array<(s: PlaybackState) => void> = [];

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
  for (const fn of _listeners) fn(_playback);
}

export function subscribePlayback(fn: (s: PlaybackState) => void): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((f) => f !== fn);
  };
}

// Set of animated object names — SyncViewer checks this to avoid fighting
// with the mixer during playback.
const _animatedNames = new Set<string>();

export function setAnimatedObjectNames(names: Set<string>) {
  _animatedNames.clear();
  for (const n of names) _animatedNames.add(n);
}

export function shouldSkipBlenderTransform(name: string): boolean {
  return _playback.playing && _animatedNames.has(name);
}

// ---------------------------------------------------------------------------
// AnimationController
// ---------------------------------------------------------------------------
export function AnimationController() {
  const animationGlb = useBlenderStore((s) => s.animationGlb);
  const sceneData = useBlenderStore((s) => s.sceneData);
  const scene = useThree((r) => r.scene);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const clipsRef = useRef<THREE.AnimationClip[]>([]);
  const prevSizeRef = useRef(0);

  // ---- Load GLB + extract clips when new animation data arrives ----
  useEffect(() => {
    if (!animationGlb || !scene) return;

    // Detect change by byte size
    if (animationGlb.byteLength === prevSizeRef.current) return;
    prevSizeRef.current = animationGlb.byteLength;

    const loader = new GLTFLoader();

    loader.parse(animationGlb, "", async (gltf) => {
      const clips = gltf.animations;
      if (clips.length === 0) return;

      // Tear down old mixer
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current.uncacheRoot(scene);
      }

      clipsRef.current = clips;
      const mixer = new THREE.AnimationMixer(scene);
      mixerRef.current = mixer;
      actionsRef.current.clear();

      for (const clip of clips) {
        actionsRef.current.set(clip.name, mixer.clipAction(clip));
      }

      // Track which objects are driven by animations
      const names = new Set<string>();
      for (const clip of clips) {
        for (const track of clip.tracks) {
          // Track name format: "ObjectName.property"
          const dot = track.name.lastIndexOf(".");
          if (dot > 0) names.add(track.name.substring(0, dot));
        }
      }
      setAnimatedObjectNames(names);

      // Auto-select first clip
      const first = clips[0];
      setPlaybackState({
        activeClip: first.name,
        duration: first.duration,
        currentTime: 0,
        playing: false,
      });
    });
  }, [animationGlb, scene]);

  // ---- Subscribe to playback changes from sidebar ----
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
        mixer.stopAllAction();
        for (const [name, action] of actionsRef.current) {
          action.reset();
          if (name === next.activeClip) {
            action.play();
            action.paused = !next.playing;
          }
        }
      }

      mixer.timeScale = next.speed;
      prevActiveRef.current = next.activeClip;
      prevPlayingRef.current = next.playing;
    });
  }, []);

  // ---- Advance mixer each frame ----
  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const s = playbackRef.current;

    if (s.activeClip) {
      const action = actionsRef.current.get(s.activeClip);
      if (action) {
        if (!s.playing) {
          // Scrubbing — seek to currentTime
          const diff = Math.abs(action.time - s.currentTime);
          if (diff > 0.03) {
            action.time = s.currentTime;
            mixer.update(0);
          }
        } else {
          mixer.update(delta * s.speed);
          if (Math.abs(action.time - getPlaybackState().currentTime) > 0.05) {
            setPlaybackState({ currentTime: action.time });
          }
        }
      }
    }
  });

  return null;
}
