import { create } from "zustand";

export type ControlPanelSource = "serial" | "rtt";

const SOURCE_KEY = "control_panel_source";

function loadSource(): ControlPanelSource {
  try {
    return localStorage.getItem(SOURCE_KEY) === "rtt" ? "rtt" : "serial";
  } catch {
    return "serial";
  }
}

interface ControlPanelState {
  source: ControlPanelSource;
  setSource: (source: ControlPanelSource) => void;
}

export const useControlPanelStore = create<ControlPanelState>((set) => ({
  source: loadSource(),
  setSource: (source) => {
    try {
      localStorage.setItem(SOURCE_KEY, source);
    } catch {
      // 存储不可用时仍允许本次会话切换。
    }
    set({ source });
  },
}));
