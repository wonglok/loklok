import { create } from "zustand";

// ---------------------------------------------------------------------------
// Settings Store
// ---------------------------------------------------------------------------
// Persisted user preferences (port number, etc.) backed by localStorage.
// Components that need the WebSocket URL read the port from here.
//
// SSR-safe: initialises with default values (server-compatible) and hydrates
// from localStorage on the client via `useSettingsStore.hydrate()` in a
// useEffect to avoid hydration mismatches.

const STORAGE_KEY = "timeversation-settings";

const DEFAULTS = { port: 8765, cameraSyncOn: true };

interface SettingsState {
  port: number;
  cameraSyncOn: boolean;

  /** True once client-side localStorage values have been loaded. */
  hydrated: boolean;

  setPort: (port: number) => void;
  setCameraSyncOn: (on: boolean) => void;

  /** Call once in a useEffect to load persisted settings on the client. */
  hydrate: () => void;
}

function loadSettings(): { port: number; cameraSyncOn: boolean } {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        port: typeof parsed.port === "number" ? parsed.port : DEFAULTS.port,
        cameraSyncOn:
          typeof parsed.cameraSyncOn === "boolean"
            ? parsed.cameraSyncOn
            : DEFAULTS.cameraSyncOn,
      };
    }
  } catch {
    // Corrupt data — fall through to defaults
  }
  return DEFAULTS;
}

function persist(state: { port: number; cameraSyncOn: boolean }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: () => {
    // No-op if already hydrated or running on the server
    if (get().hydrated || typeof window === "undefined") return;

    const saved = loadSettings();
    // Only update if values differ from defaults (avoids unnecessary re-render)
    if (saved.port !== DEFAULTS.port || saved.cameraSyncOn !== DEFAULTS.cameraSyncOn) {
      set({ ...saved, hydrated: true });
    } else {
      set({ hydrated: true });
    }
  },

  setPort: (port) => {
    persist({ port, cameraSyncOn: get().cameraSyncOn });
    set({ port });
  },

  setCameraSyncOn: (cameraSyncOn) => {
    persist({ port: get().port, cameraSyncOn });
    set({ cameraSyncOn });
  },
}));
