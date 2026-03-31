import { create } from "zustand";
import {
  loadFromStorage,
  loadNumberFromStorage,
  saveNumberToStorage,
  saveToStorage,
} from "@/lib/storage";

const LOG_PANEL_HEIGHT_KEY = "log_panel_height";
const BACKGROUND_PREFERENCES_KEY = "background_preferences";

export type BackgroundMode = "default" | "custom";

interface BackgroundPreferences {
  backgroundMode: BackgroundMode;
  backgroundImagePath: string;
  backgroundImageOpacity: number;
}

const DEFAULT_BACKGROUND_PREFERENCES: BackgroundPreferences = {
  backgroundMode: "default",
  backgroundImagePath: "",
  backgroundImageOpacity: 0.42,
};

function loadBackgroundPreferences(): BackgroundPreferences {
  const saved = loadFromStorage(BACKGROUND_PREFERENCES_KEY, DEFAULT_BACKGROUND_PREFERENCES);
  const backgroundMode: BackgroundMode = saved.backgroundMode === "custom" ? "custom" : "default";
  const backgroundImagePath =
    typeof saved.backgroundImagePath === "string" ? saved.backgroundImagePath : "";
  const rawOpacity = Number(saved.backgroundImageOpacity);
  const backgroundImageOpacity =
    Number.isFinite(rawOpacity) && rawOpacity >= 0 && rawOpacity <= 1
      ? rawOpacity
      : DEFAULT_BACKGROUND_PREFERENCES.backgroundImageOpacity;

  return {
    backgroundMode,
    backgroundImagePath,
    backgroundImageOpacity,
  };
}

interface UiPreferencesState {
  logPanelHeight: number;
  backgroundMode: BackgroundMode;
  backgroundImagePath: string;
  backgroundImageOpacity: number;
  setLogPanelHeight: (height: number) => void;
  setBackgroundMode: (mode: BackgroundMode) => void;
  setBackgroundImagePath: (path: string) => void;
  setBackgroundImageOpacity: (opacity: number) => void;
  clearBackgroundImage: () => void;
}

type PersistedBackgroundPreferences = Pick<
  UiPreferencesState,
  "backgroundMode" | "backgroundImagePath" | "backgroundImageOpacity"
>;

export const useUiPreferencesStore = create<UiPreferencesState>((set) => {
  const backgroundPreferences = loadBackgroundPreferences();

  const persistBackgroundPreferences = (nextState: PersistedBackgroundPreferences) => {
    saveToStorage(BACKGROUND_PREFERENCES_KEY, nextState);
  };

  return {
    logPanelHeight: loadNumberFromStorage(
      LOG_PANEL_HEIGHT_KEY,
      128,
      (value) => value >= 80 && value <= 600
    ),
    ...backgroundPreferences,
    setLogPanelHeight: (height) => {
      saveNumberToStorage(LOG_PANEL_HEIGHT_KEY, height);
      set({ logPanelHeight: height });
    },
    setBackgroundMode: (backgroundMode) => {
      set((state) => {
        const nextState: PersistedBackgroundPreferences = {
          backgroundMode,
          backgroundImagePath: state.backgroundImagePath,
          backgroundImageOpacity: state.backgroundImageOpacity,
        };
        persistBackgroundPreferences(nextState);
        return nextState;
      });
    },
    setBackgroundImagePath: (backgroundImagePath) => {
      set((state) => {
        const nextState: PersistedBackgroundPreferences = {
          backgroundMode: backgroundImagePath ? "custom" : "default",
          backgroundImagePath,
          backgroundImageOpacity: state.backgroundImageOpacity,
        };
        persistBackgroundPreferences(nextState);
        return nextState;
      });
    },
    setBackgroundImageOpacity: (backgroundImageOpacity) => {
      set((state) => {
        const nextState: PersistedBackgroundPreferences = {
          backgroundMode: state.backgroundMode,
          backgroundImagePath: state.backgroundImagePath,
          backgroundImageOpacity,
        };
        persistBackgroundPreferences(nextState);
        return nextState;
      });
    },
    clearBackgroundImage: () => {
      const nextState = {
        ...DEFAULT_BACKGROUND_PREFERENCES,
      };
      persistBackgroundPreferences(nextState);
      set(nextState);
    },
  };
});
