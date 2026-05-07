import { create } from "zustand";
import type { ProbeInfo, TargetInfo, ConnectionInfo, DeviceSettings } from "@/lib/types";

interface ProbeState {
  // 状态
  probes: ProbeInfo[];
  selectedProbe: ProbeInfo | null;
  selectedChipName: string; // 新增：用户输入的芯片名称
  connected: boolean;
  connectionInfo: ConnectionInfo | null;
  targetInfo: TargetInfo | null;
  settings: DeviceSettings;
  loading: boolean;
  error: string | null;

  // 自动断开配置
  autoDisconnect: boolean;
  autoDisconnectTimeout: number; // 毫秒

  // 操作
  setProbes: (probes: ProbeInfo[]) => void;
  selectProbe: (probe: ProbeInfo | null) => void;
  setSelectedChipName: (chipName: string) => void; // 新增
  setConnected: (connected: boolean, info?: ConnectionInfo | null, target?: TargetInfo | null) => void;
  setSettings: (settings: Partial<DeviceSettings>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAutoDisconnect: (enabled: boolean) => void;
  setAutoDisconnectTimeout: (timeout: number) => void;
  reset: () => void;
}

const defaultSettings: DeviceSettings = {
  interfaceType: "SWD",
  clockSpeed: 1000000, // 1MHz
  connectMode: "Normal",
  resetMode: "Software",
  voltage: 3.3,
};

export const useProbeStore = create<ProbeState>((set) => ({
  probes: [],
  selectedProbe: null,
  selectedChipName: "", // 新增：初始为空
  connected: false,
  connectionInfo: null,
  targetInfo: null,
  settings: defaultSettings,
  loading: false,
  error: null,
  autoDisconnect: true, // 默认启用
  autoDisconnectTimeout: 10000, // 默认10秒

  setProbes: (probes) => set({ probes }),

  selectProbe: (probe) => set({ selectedProbe: probe }),

  setSelectedChipName: (selectedChipName) => set({ selectedChipName }), // 新增

  setConnected: (connected, info = null, target = null) => set({ connected, connectionInfo: info, targetInfo: target }),

  setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  setAutoDisconnect: (autoDisconnect) => set({ autoDisconnect }),

  setAutoDisconnectTimeout: (autoDisconnectTimeout) => set({ autoDisconnectTimeout }),

  reset: () =>
    set({
      selectedProbe: null,
      connected: false,
      connectionInfo: null,
      targetInfo: null,
      loading: false,
      error: null,
    }),
}));
