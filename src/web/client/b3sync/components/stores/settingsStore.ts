import { create } from "zustand";

const DEFAULTS = { port: 8765, cameraSyncOn: true };

interface SettingsState {
  port: number;
  cameraSyncOn: boolean;

  setPort: (port: number) => void;
  setCameraSyncOn: (on: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,

  setPort: (port) => {
    set({ port });
  },

  setCameraSyncOn: (cameraSyncOn) => {
    set({ cameraSyncOn });
  },
}));
