// ---------------------------------------------------------------------------
// Project Store — save / load orchestration
// ---------------------------------------------------------------------------
// Zustand store that coordinates persistence via OPFS.  Saves read from
// `blenderStore` and loads write into it via `loadSaveData`.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { useBlenderStore } from "./blenderStore";
import { saveProject, loadProject } from "../workspace/ProjectStorage";
import type { LoadProgress } from "../workspace/ProjectStorage";
import type { LoadedProjectData } from "../workspace/ProjectSaveData";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface ProjectStore {
  projectID: string | null;
  isSaving: boolean;
  isLoading: boolean;
  isLoaded: boolean;
  loadError: string | null;
  saveError: string | null;
  loadProgress: { current: number; total: number; label: string } | null;

  // Actions
  setProjectID: (id: string) => void;

  /** Save the current blenderStore state to OPFS. */
  save: () => Promise<void>;

  /** Load the latest saved version from OPFS and populate blenderStore. */
  load: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Progress helper
// ---------------------------------------------------------------------------

function buildProgressLabel(p: LoadProgress): string {
  switch (p.phase) {
    case "scene":
      return "Reading scene data…";
    case "geo":
      return `Loading geometry (${p.current}/${p.total})…`;
    case "tex":
      return `Loading textures (${p.current}/${p.total})…`;
    case "hdr":
      return "Loading environment map…";
    default:
      return "Loading…";
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projectID: null,
  isSaving: false,
  isLoading: false,
  isLoaded: false,
  loadError: null,
  saveError: null,
  loadProgress: null,

  setProjectID: (id) => set({ projectID: id }),

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------
  save: async () => {
    const { projectID } = get();
    if (!projectID) return;

    set({ isSaving: true, saveError: null });
    try {
      await saveProject(projectID);
      set({ isSaving: false, isLoaded: true });
    } catch (e) {
      set({
        isSaving: false,
        saveError: e instanceof Error ? e.message : "Save failed",
      });
    }
  },

  // ------------------------------------------------------------------
  // Load
  // ------------------------------------------------------------------
  load: async () => {
    const { projectID } = get();
    if (!projectID) return false;

    set({
      isLoading: true,
      loadError: null,
      loadProgress: { current: 0, total: 1, label: "Reading scene data…" },
    });

    try {
      const data: LoadedProjectData | null = await loadProject(
        projectID,
        (p) => {
          set({
            loadProgress: {
              current: p.current,
              total: p.total,
              label: buildProgressLabel(p),
            },
          });
        },
      );

      if (!data) {
        set({ isLoading: false, loadProgress: null });
        return false;
      }

      // Bulk-load into blenderStore
      useBlenderStore.getState().loadSaveData(data);

      set({ isLoading: false, isLoaded: true, loadProgress: null });
      return true;
    } catch (e) {
      set({
        isLoading: false,
        loadError: e instanceof Error ? e.message : "Load failed",
        loadProgress: null,
      });
      return false;
    }
  },
}));
