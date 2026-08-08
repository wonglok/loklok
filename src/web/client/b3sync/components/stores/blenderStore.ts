import { create } from "zustand";
import type {
  ConnectionState,
  SceneData,
  ImageData,
  TextureData,
  GeoBuffer,
  CameraData,
  LightData,
} from "../types/blenderTypes";

// ---------------------------------------------------------------------------
// Blender Sync Store
// ---------------------------------------------------------------------------
// Single source of truth for all data received from the Blender WebSocket.
// The blenderSyncStore manages the WebSocket lifecycle and writes into
// this store; every component reads from it via selectors.

interface BlenderStore {
  // ---- State ----
  connectionState: ConnectionState;
  sceneData: SceneData;
  hdrData: ImageData | null;
  /** World environment intensity — updated separately from HDR pixels. */
  hdrIntensity: number;
  texData: Map<string, TextureData>;
  /** Geometry buffers keyed by object name — populated by binary geo messages. */
  geoBuffers: Map<string, GeoBuffer>;
  /** Latest viewport camera from Blender — updated at ~30 Hz when sync is enabled. */
  cameraData: CameraData | null;
  /** All scene Camera objects from Blender — sent once per client, re-sent on change. */
  cameras: CameraData[];
  /** User-selected scene camera to view through (null = follow viewport). */
  selectedCamera: CameraData | null;
  /** All scene Light objects from Blender — sent once per client, re-sent on change. */
  lights: LightData[];

  // ---- Actions ----
  setConnectionState: (next: ConnectionState) => void;
  setSceneData: (next: SceneData) => void;
  setHdrData: (next: ImageData | null) => void;
  setHdrIntensity: (value: number) => void;
  addTexture: (name: string, data: TextureData) => void;
  setGeoBuffer: (name: string, buf: GeoBuffer) => void;
  setCameraData: (next: CameraData | null) => void;
  setCameras: (next: CameraData[]) => void;
  /** Select a scene camera to view through, or null to follow the viewport. */
  selectCamera: (cam: CameraData | null) => void;
  setLights: (next: LightData[]) => void;

  /** Bulk-load saved project data — all state set atomically. */
  loadSaveData: (data: {
    sceneData: SceneData;
    hdrData: ImageData | null;
    hdrIntensity: number;
    lights: LightData[];
    cameras: CameraData[];
    geoBuffers: Map<string, GeoBuffer>;
    texData: Map<string, TextureData>;
  }) => void;
}

export const useBlenderStore = create<BlenderStore>((set) => ({
  // Initial state
  connectionState: "disconnected",
  sceneData: { objects: [] },
  hdrData: null,
  hdrIntensity: 1.0,
  texData: new Map(),
  geoBuffers: new Map(),
  cameraData: null,
  cameras: [],
  selectedCamera: null,
  lights: [],

  // Actions
  setConnectionState: (next) => set({ connectionState: next }),

  setSceneData: (next) => set({ sceneData: next }),

  setHdrData: (next) => set({ hdrData: next }),

  setHdrIntensity: (value) => set({ hdrIntensity: value }),

  addTexture: (name, data) =>
    set((prev) => {
      const next = new Map(prev.texData);
      next.set(name, data);
      return { texData: next };
    }),

  setGeoBuffer: (name, buf) =>
    set((prev) => {
      const next = new Map(prev.geoBuffers);
      next.set(name, buf);
      return { geoBuffers: next };
    }),

  setCameraData: (next) => set({ cameraData: next }),

  setCameras: (next) => set({ cameras: next }),

  selectCamera: (cam) => set({ selectedCamera: cam }),

  setLights: (next) => set({ lights: next }),


  loadSaveData: (data) =>
    set({
      sceneData: data.sceneData,
      hdrData: data.hdrData,
      hdrIntensity: data.hdrIntensity,
      lights: data.lights,
      cameras: data.cameras,
      geoBuffers: data.geoBuffers,
      texData: data.texData,
    }),
}));
