import { create } from "zustand";
import { loadNumberFromStorage, saveNumberToStorage } from "@/lib/storage";

const LOG_PANEL_HEIGHT_KEY = "log_panel_height";

interface UiPreferencesState {
  logPanelHeight: number;
  setLogPanelHeight: (height: number) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>((set) => ({
  logPanelHeight: loadNumberFromStorage(
    LOG_PANEL_HEIGHT_KEY,
    128,
    (value) => value >= 80 && value <= 600
  ),
  setLogPanelHeight: (height) => {
    saveNumberToStorage(LOG_PANEL_HEIGHT_KEY, height);
    set({ logPanelHeight: height });
  },
}));
