import { create } from "zustand";
import { isOPFSAvailable, getOPFSUsage } from "../utils/workspaceStorage";

interface WorkspaceState {
  /** Whether OPFS storage is available in this context. */
  opfsReady: boolean;

  /** Storage usage in bytes (null = not yet estimated). */
  storageUsage: number | null;

  /** Storage quota in bytes (null = not yet estimated). */
  storageQuota: number | null;

  /** Initialise OPFS and fetch storage estimate on mount. */
  initOPFS: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  opfsReady: isOPFSAvailable(),
  storageUsage: null,
  storageQuota: null,

  initOPFS: async () => {
    if (!isOPFSAvailable()) {
      set({ opfsReady: false });
      return;
    }

    try {
      // Touch OPFS to confirm it's writable
      const root = await navigator.storage.getDirectory();
      await root.getDirectoryHandle("workspace", { create: true });
      set({ opfsReady: true });

      // Fetch storage estimate
      const usage = await getOPFSUsage();
      if (usage) {
        set({ storageUsage: usage.usage, storageQuota: usage.quota });
      }
    } catch {
      set({ opfsReady: false });
    }
  },
}));
