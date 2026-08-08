import { create } from "zustand";
import { useBlenderStore } from "./blenderStore";
import { useSettingsStore } from "./settingsStore";
import type { CameraData, LightData, RigBuffer, AnimClipData, KeyframeTrackData } from "../types/blenderTypes";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PendingBinary =
  | { kind: "hdr"; width: number; height: number }
  | { kind: "tex"; name: string; mime: string }
  | {
      kind: "geo";
      name: string;
      version: string;
      vCount: number;
      iCount: number;
      hasUVs: boolean;
    }
  | {
      kind: "rig";
      name: string;
      boneNames: string[];
      boneParents: number[];
      boneCount: number;
      vertexCount: number;
      clipCount: number;
    };

// ---------------------------------------------------------------------------
// Blender Sync Store
// ---------------------------------------------------------------------------
// Zustand store that manages the WebSocket connection to the Blender add-on
// and writes all incoming data into `blenderStore`.  Call `connect()` once
// high in the component tree (e.g. inside a layout or page).  Components
// read data via `useBlenderStore` selectors — this store only owns the
// transport lifecycle.
//
// Replaces the old `useBlenderSync` React hook.

interface BlenderSyncStore {
  // ---- Internal transport state (not consumed by UI) ----
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  pendingBinary: PendingBinary | null;

  // ---- Actions ----
  /** Open a WebSocket to the Blender add-on. Idempotent — no-op if already open. */
  connect: () => void;
  /** Close the WebSocket and cancel any pending reconnect. */
  disconnect: () => void;
}

export const useBlenderSyncStore = create<BlenderSyncStore>((set, get) => ({
  ws: null,
  reconnectTimer: undefined,
  pendingBinary: null,

  // ------------------------------------------------------------------
  // Connect
  // ------------------------------------------------------------------
  connect: () => {
    const { ws } = get();
    if (ws?.readyState === WebSocket.OPEN) return;

    const port = useSettingsStore.getState().port;
    const wsUrl = `ws://localhost:${port}`;

    const {
      setConnectionState,
      setSceneData,
      setHdrData,
      setHdrIntensity,
      addTexture,
      setGeoBuffer,
      setCameraData,
      setCameras,
      setLights,
      setRigData,
    } = useBlenderStore.getState();

    setConnectionState("connecting");
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    set({ ws: socket });

    // ---- open ----
    socket.onopen = () => {
      setConnectionState("connected");
    };

    // ---- message ----
    socket.onmessage = (event: MessageEvent) => {
      // --- Binary: pixel data (HDR, texture, or geometry) ---
      if (event.data instanceof ArrayBuffer) {
        const pending = get().pendingBinary;
        set({ pendingBinary: null });

        if (!pending) return;

        if (pending.kind === "hdr") {
          useBlenderStore.getState().setHdrData({
            width: pending.width,
            height: pending.height,
            pixels: event.data,
          });
        } else if (pending.kind === "tex") {
          useBlenderStore.getState().addTexture(pending.name, {
            mime: pending.mime,
            bytes: event.data,
          });
        } else if (pending.kind === "geo") {
          // Unpack binary blob with ZERO-COPY typed array views:
          // [float32 vertices][uint32 indices][float32 UVs?]
          // Views keep the underlying ArrayBuffer alive — no data copy.
          const vBytes = pending.vCount * 3 * 4;
          const iBytes = pending.iCount * 4;

          const vertices = new Float32Array(event.data, 0, pending.vCount * 3);
          const indices = new Uint32Array(event.data, vBytes, pending.iCount);

          let uvs: Float32Array | undefined;
          if (pending.hasUVs) {
            uvs = new Float32Array(
              event.data,
              vBytes + iBytes,
              pending.vCount * 2,
            );
          }

          useBlenderStore.getState().setGeoBuffer(pending.name, {
            version: pending.version,
            vertices,
            indices,
            uvs,
          });
        } else if (pending.kind === "rig") {
          // Unpack binary blob:
          // [invBindMatrices: boneCount*16*float32]
          // [skinIndices: vertexCount*4*uint16]
          // [skinWeights: vertexCount*4*float32]
          // [per-clip animation data...]
          let offset = 0;
          const dv = new DataView(event.data);

          const matSize = pending.boneCount * 16 * 4;
          const invBindMatrices = new Float32Array(
            event.data, offset, pending.boneCount * 16,
          );
          offset += matSize;

          const skinIndices = new Uint16Array(
            event.data, offset, pending.vertexCount * 4,
          );
          offset += pending.vertexCount * 4 * 2;

          const skinWeights = new Float32Array(
            event.data, offset, pending.vertexCount * 4,
          );
          offset += pending.vertexCount * 4 * 4;

          // Animation clips
          const animClips: AnimClipData[] = [];
          for (let c = 0; c < pending.clipCount; c++) {
            const nameLen = dv.getUint32(offset, true); offset += 4;
            const name = new TextDecoder().decode(
              new Uint8Array(event.data, offset, nameLen),
            );
            offset += nameLen;
            const duration = dv.getFloat32(offset, true); offset += 4;
            const trackCount = dv.getUint32(offset, true); offset += 4;

            const tracks: KeyframeTrackData[] = [];
            for (let t = 0; t < trackCount; t++) {
              const boneIndex = dv.getUint32(offset, true); offset += 4;
              const property = dv.getUint8(offset); offset += 1;
              offset += 3; // padding to align
              const keyCount = dv.getUint32(offset, true); offset += 4;

              const times = new Float32Array(
                event.data, offset, keyCount,
              );
              offset += keyCount * 4;

              const valueSize = property === 1 ? 4 : 3; // quat=4, pos/scale=3
              const values = new Float32Array(
                event.data, offset, keyCount * valueSize,
              );
              offset += keyCount * valueSize * 4;

              tracks.push({ boneIndex, property, times, values });
            }

            animClips.push({ name, duration, tracks });
          }

          useBlenderStore.getState().setRigData(pending.name, {
            boneNames: pending.boneNames,
            boneParents: new Int32Array(pending.boneParents),
            invBindMatrices,
            skinIndices,
            skinWeights,
            animClips,
          });
        }
        return;
      }

      // --- Text: JSON ----
      const text = event.data as string;
      try {
        const data = JSON.parse(text);

        if (data.type === "hdr") {
          if (data.width > 0 && data.height > 0) {
            set({
              pendingBinary: {
                kind: "hdr",
                width: data.width as number,
                height: data.height as number,
              },
            });
          } else {
            useBlenderStore.getState().setHdrData(null);
            set({ pendingBinary: null });
          }
        } else if (data.type === "hdr-intensity") {
          useBlenderStore
            .getState()
            .setHdrIntensity((data.value as number) ?? 1.0);
        } else if (data.type === "tex") {
          if (data.mime) {
            set({
              pendingBinary: {
                kind: "tex",
                name: data.name as string,
                mime: data.mime as string,
              },
            });
          }
        } else if (data.type === "geo") {
          set({
            pendingBinary: {
              kind: "geo",
              name: data.name as string,
              version: data.version as string,
              vCount: data.vCount as number,
              iCount: data.iCount as number,
              hasUVs: !!data.hasUVs,
            },
          });
        } else if (data.type === "rig") {
          set({
            pendingBinary: {
              kind: "rig",
              name: data.name as string,
              boneNames: data.boneNames as string[],
              boneParents: data.boneParents as number[],
              boneCount: data.boneCount as number,
              vertexCount: data.vertexCount as number,
              clipCount: data.clipCount as number,
            },
          });
        } else if (data.type === "camera") {
          useBlenderStore.getState().setCameraData({
            name: "Viewport",
            position: data.position as [number, number, number],
            quaternion: data.quaternion as [number, number, number, number],
            euler: data.euler as [number, number, number],
            scale: data.scale as [number, number, number],
            fov: data.fov as number,
            ortho: !!data.ortho,
            isViewport: true,
          });
        } else if (data.type === "cameras") {
          const raw = (
            Array.isArray(data.cameras) ? data.cameras : []
          ) as any[];
          const cameras: CameraData[] = raw.map((c) => ({
            name: c.name as string,
            position: c.position as [number, number, number],
            quaternion: c.quaternion as [number, number, number, number],
            euler: c.euler as [number, number, number],
            scale: c.scale as [number, number, number],
            fov: c.fov as number,
            ortho: !!c.ortho,
            orthoScale: c.orthoScale as number | undefined,
            clipStart: c.clipStart as number | undefined,
            clipEnd: c.clipEnd as number | undefined,
            isActive: !!c.isActive,
            isViewport: false,
          }));
          useBlenderStore.getState().setCameras(cameras);
        } else if (data.type === "lights") {
          const raw = (Array.isArray(data.lights) ? data.lights : []) as any[];
          const lights: LightData[] = raw.map((l) => ({
            name: l.name as string,
            type: l.type as string,
            color: l.color as [number, number, number],
            intensity: l.intensity as number,
            position: l.position as [number, number, number],
            quaternion: l.quaternion as [number, number, number, number],
            scale: l.scale as [number, number, number],
            distance: l.distance as number | undefined,
            radius: l.radius as number | undefined,
            angle: l.angle as number | undefined,
            coneAngle: l.coneAngle as number | undefined,
            penumbra: l.penumbra as number | undefined,
            width: l.width as number | undefined,
            height: l.height as number | undefined,
            shape: l.shape as string | undefined,
            castShadow: !!l.castShadow,
          }));
          useBlenderStore.getState().setLights(lights);
        } else if (Array.isArray(data.objects)) {
          useBlenderStore.getState().setSceneData(data as any);
        }
      } catch {
        // Ignore malformed data
      }
    };

    // ---- close ----
    socket.onclose = () => {
      useBlenderStore.getState().setConnectionState("disconnected");
      set({ ws: null, pendingBinary: null });
      const timer = setTimeout(() => {
        get().connect();
      }, 2000);
      set({ reconnectTimer: timer });
    };

    // ---- error ----
    socket.onerror = () => {
      useBlenderStore.getState().setConnectionState("error");
      socket.close();
    };
  },

  // ------------------------------------------------------------------
  // Disconnect
  // ------------------------------------------------------------------
  disconnect: () => {
    const { ws, reconnectTimer } = get();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      set({ reconnectTimer: undefined });
    }
    if (ws) {
      ws.onclose = null; // prevent auto-reconnect
      ws.close();
      set({ ws: null, pendingBinary: null });
    }
    useBlenderStore.getState().setConnectionState("disconnected");
  },
}));
