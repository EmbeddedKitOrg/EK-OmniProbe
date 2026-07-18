import { create } from "zustand";
import type { ChartWorkspaceSource } from "@/lib/chartWorkspace";

interface ChartWorkspaceState {
  detached: Record<ChartWorkspaceSource, boolean>;
  setDetached: (source: ChartWorkspaceSource, detached: boolean) => void;
}

export const useChartWorkspaceStore = create<ChartWorkspaceState>((set) => ({
  detached: {
    rtt: false,
    serial: false,
    bluetooth: false,
  },

  setDetached: (source, detached) =>
    set((state) => ({
      detached: {
        ...state.detached,
        [source]: detached,
      },
    })),
}));
