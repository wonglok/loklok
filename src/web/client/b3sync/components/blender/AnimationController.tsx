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

// ---------------------------------------------------------------------------
// Names of objects driven by the GLB (skinned meshes, bones).
// SyncViewer reads these to avoid creating duplicate regular meshes or
// fighting with the mixer during playback.
// ---------------------------------------------------------------------------

const _glbObjectNames = new Set<string>();

export function setGlbObjectNames(names: Set<string>) {
  _glbObjectNames.clear();
  for (const n of names) _glbObjectNames.add(n);
}

/** True when SyncViewer should skip creating a regular Mesh for this object
 *  (it's a skinned mesh handled by the GLB). Always true regardless of playback. */
export function isGlbObject(name: string): boolean {
  return _glbObjectNames.has(name);
}

/** True when SyncViewer should skip position/quaternion/scale updates —
 *  the mixer is driving this object during playback. */
export function shouldSkipBlenderTransform(name: string): boolean {
  return _playback.playing && _glbObjectNames.has(name);
}

// ---------------------------------------------------------------------------
// AnimationController — loads the animation GLB, adds skinned meshes + bones
// to the scene, and drives the AnimationMixer.
// ---------------------------------------------------------------------------
export function AnimationController() {
  const animationGlb = useBlenderStore((s) => s.animationGlb);
  const scene = useThree((r) => r.scene);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const glbRootRef = useRef<THREE.Group | null>(null);
  const prevSizeRef = useRef(0);

  // ---- Load GLB + add scene objects + extract clips ----
  useEffect(() => {
    if (!animationGlb || !scene) return;

    // Detect change by byte size
    if (animationGlb.byteLength === prevSizeRef.current) return;
    prevSizeRef.current = animationGlb.byteLength;

    const loader = new GLTFLoader();

    loader.parse(animationGlb, "", (gltf) => {
      // Remove old GLB scene objects
      if (glbRootRef.current) {
        scene.remove(glbRootRef.current);
        // Dispose skinned meshes and skeletons
        glbRootRef.current.traverse((child) => {
          if (child instanceof THREE.SkinnedMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
      }

      // Tear down old mixer
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current.uncacheRoot(scene);
      }

      // Collect names of all GLB objects (skinned meshes, bones, armature nodes)
      const glbNames = new Set<string>();
      gltf.scene.traverse((child) => {
        if (child.name) glbNames.add(child.name);
      });
      setGlbObjectNames(glbNames);

      // Add the glTF scene to the Three.js scene
      scene.add(gltf.scene);
      glbRootRef.current = gltf.scene;

      // Build clips and mixer
      const clips = gltf.animations;
      if (clips.length === 0) return;

      const mixer = new THREE.AnimationMixer(scene);
      mixerRef.current = mixer;
      actionsRef.current.clear();

      for (const clip of clips) {
        actionsRef.current.set(clip.name, mixer.clipAction(clip));
      }

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
