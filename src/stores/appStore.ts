import { create } from "zustand";
import { isAppMode, type AppMode } from "@/lib/workspaces";

export type { AppMode } from "@/lib/workspaces";

// App mode persistence key
const APP_MODE_KEY = "app_mode";

function loadAppMode(): AppMode {
  try {
    const saved = localStorage.getItem(APP_MODE_KEY);
    if (isAppMode(saved)) return saved;
  } catch {
    // 静默处理，使用默认值
  }
  return "flash"; // Default to flash mode
}

function saveAppMode(mode: AppMode) {
  try {
    localStorage.setItem(APP_MODE_KEY, mode);
  } catch {
    // 静默处理
  }
}

interface AppState {
  // Current application mode
  mode: AppMode;

  // Actions
  setMode: (mode: AppMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: loadAppMode(),

  setMode: (mode) => {
    saveAppMode(mode);
    set({ mode });
  },
}));
