import { create } from "zustand";
import { useMemo } from "react";
import type {
  SerialConfig,
  SerialLine,
  SerialStats,
  DataSourceType,
  LineEnding,
  Encoding,
  LocalSerialConfig,
  TcpSerialConfig,
} from "@/lib/serialTypes";
import type { ColorParserConfig } from "@/lib/rttColorParser";
import { loadColorParserConfig, saveColorParserConfig } from "@/lib/rttColorParser";
import type { ChartConfig, ChartDataPoint, ViewMode } from "@/lib/chartTypes";
import { DEFAULT_CHART_CONFIG } from "@/lib/chartTypes";
import { parseLogLevel } from "@/lib/utils";
import { loadFromStorage, saveToStorage, loadStringFromStorage, loadNumberFromStorage, saveNumberToStorage } from "@/lib/storage";

// Persistence keys
const SERIAL_CONFIG_KEY = "serial_config";
const SERIAL_CHART_CONFIG_KEY = "serial_chart_config";
const SERIAL_VIEW_MODE_KEY = "serial_view_mode";
const SERIAL_SPLIT_RATIO_KEY = "serial_split_ratio";
const SERIAL_SEND_SETTINGS_KEY = "serial_send_settings";

// Default local serial config
const defaultLocalConfig: LocalSerialConfig = {
  type: "local",
  port: "",
  baud_rate: 115200,
  data_bits: 8,
  stop_bits: 1,
  parity: "none",
  flow_control: "none",
};

// Default TCP config
const defaultTcpConfig: TcpSerialConfig = {
  type: "tcp",
  host: "192.168.1.1",
  port: 8080,
  reconnect: false,
};

interface SendSettings {
  encoding: Encoding;
  lineEnding: LineEnding;
  hexMode: boolean;
}

const defaultSerialConfigBundle = { local: defaultLocalConfig, tcp: defaultTcpConfig, activeType: "local" as DataSourceType };
const defaultSendSettings: SendSettings = { encoding: "utf-8", lineEnding: "lf", hexMode: false };

const VIEW_MODE_VALUES = ["text", "chart", "split"] as const;


interface SerialState {
  // Connection state
  connected: boolean;
  connecting: boolean;
  running: boolean;
  error: string | null;

  // Configuration
  localConfig: LocalSerialConfig;
  tcpConfig: TcpSerialConfig;
  activeSourceType: DataSourceType;

  // Data
  lines: SerialLine[];
  maxLines: number;
  stats: SerialStats;

  // Display settings
  autoScroll: boolean;
  showTimestamp: boolean;
  splitByDirection: boolean;
  searchQuery: string;
  displayMode: "text" | "hex";
  colorParserConfig: ColorParserConfig;

  // View mode
  viewMode: ViewMode;
  splitRatio: number;

  // Chart data
  chartData: ChartDataPoint[];
  chartConfig: ChartConfig;
  chartPaused: boolean;

  // Parse stats
  parseSuccessCount: number;
  parseFailCount: number;

  // Send settings
  sendSettings: SendSettings;

  // Line ID counter
  lineIdCounter: number;

  // Actions
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setRunning: (running: boolean) => void;
  setError: (error: string | null) => void;

  setLocalConfig: (config: Partial<LocalSerialConfig>) => void;
  setTcpConfig: (config: Partial<TcpSerialConfig>) => void;
  setActiveSourceType: (type: DataSourceType) => void;
  getActiveConfig: () => SerialConfig;

  addLine: (line: Omit<SerialLine, "id">) => void;
  addLines: (lines: Omit<SerialLine, "id">[]) => void;
  clearLines: () => void;
  updateStats: (stats: SerialStats) => void;

  setAutoScroll: (enabled: boolean) => void;
  setShowTimestamp: (show: boolean) => void;
  setSplitByDirection: (split: boolean) => void;
  setSearchQuery: (query: string) => void;
  setDisplayMode: (mode: "text" | "hex") => void;
  setColorParserConfig: (config: ColorParserConfig) => void;

  setViewMode: (mode: ViewMode) => void;
  setSplitRatio: (ratio: number) => void;

  setChartConfig: (config: ChartConfig) => void;
  addChartData: (data: ChartDataPoint) => void;
  clearChartData: () => void;
  setChartPaused: (paused: boolean) => void;

  incrementParseSuccess: () => void;
  incrementParseFail: () => void;

  setSendSettings: (settings: Partial<SendSettings>) => void;

  reset: () => void;
}

const savedConfig = loadSerialConfig();
const savedSendSettings = loadSendSettings();

export const useSerialStore = create<SerialState>((set, get) => ({
  // Initial state
  connected: false,
  connecting: false,
  running: false,
  error: null,

  localConfig: savedConfig.local,
  tcpConfig: savedConfig.tcp,
  activeSourceType: savedConfig.activeType,

  lines: [],
  maxLines: 10000,
  stats: { bytes_received: 0, bytes_sent: 0 },

  autoScroll: true,
  showTimestamp: true,
  splitByDirection: false,
  searchQuery: "",
  displayMode: "text",
  colorParserConfig: loadColorParserConfig(),

  viewMode: loadViewMode(),
  splitRatio: loadSplitRatio(),

  chartData: [],
  chartConfig: loadChartConfig(),
  chartPaused: false,

  parseSuccessCount: 0,
  parseFailCount: 0,

  sendSettings: savedSendSettings,

  lineIdCounter: 0,

  // Actions
  setConnected: (connected) => set({ connected }),
  setConnecting: (connecting) => set({ connecting }),
  setRunning: (running) => set({ running, error: null }),
  setError: (error) => set({ error, running: false }),

  setLocalConfig: (config) => {
    set((state) => {
      const newLocal = { ...state.localConfig, ...config };
      saveSerialConfig({ local: newLocal, tcp: state.tcpConfig, activeType: state.activeSourceType });
      return { localConfig: newLocal };
    });
  },

  setTcpConfig: (config) => {
    set((state) => {
      const newTcp = { ...state.tcpConfig, ...config };
      saveSerialConfig({ local: state.localConfig, tcp: newTcp, activeType: state.activeSourceType });
      return { tcpConfig: newTcp };
    });
  },

  setActiveSourceType: (type) => {
    set((state) => {
      saveSerialConfig({ local: state.localConfig, tcp: state.tcpConfig, activeType: type });
      return { activeSourceType: type };
    });
  },

  getActiveConfig: () => {
    const state = get();
    if (state.activeSourceType === "tcp") {
      return state.tcpConfig;
    }
    return state.localConfig;
  },

  addLine: (line) =>
    set((state) => {
      const id = state.lineIdCounter + 1;
      const newLine: SerialLine = { ...line, id };
      const lines = [...state.lines, newLine].slice(-state.maxLines);
      return { lines, lineIdCounter: id };
    }),

  addLines: (newLines) =>
    set((state) => {
      let idCounter = state.lineIdCounter;
      const linesWithId: SerialLine[] = newLines.map((line) => ({
        ...line,
        id: ++idCounter,
      }));
      const lines = [...state.lines, ...linesWithId].slice(-state.maxLines);
      return { lines, lineIdCounter: idCounter };
    }),

  clearLines: () => set({ lines: [], lineIdCounter: 0, stats: { bytes_received: 0, bytes_sent: 0 } }),

  updateStats: (stats) => set({ stats }),

  setAutoScroll: (autoScroll) => set({ autoScroll }),
  setShowTimestamp: (showTimestamp) => set({ showTimestamp }),
  setSplitByDirection: (splitByDirection) => set({ splitByDirection }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setDisplayMode: (displayMode) => set({ displayMode }),

  setColorParserConfig: (colorParserConfig) => {
    saveColorParserConfig(colorParserConfig);
    set({ colorParserConfig });
  },

  setViewMode: (viewMode) => {
    saveViewMode(viewMode);
    set({ viewMode });
  },

  setSplitRatio: (splitRatio) => {
    saveSplitRatio(splitRatio);
    set({ splitRatio });
  },

  setChartConfig: (chartConfig) => {
    saveChartConfig(chartConfig);
    set({ chartConfig });
  },

  addChartData: (data) =>
    set((state) => {
      if (state.chartPaused) return state;
      const newData = [...state.chartData, data];
      const trimmedData = newData.slice(-state.chartConfig.maxDataPoints);
      return { chartData: trimmedData };
    }),

  clearChartData: () => set({ chartData: [], parseSuccessCount: 0, parseFailCount: 0 }),

  setChartPaused: (chartPaused) => set({ chartPaused }),

  incrementParseSuccess: () =>
    set((state) => ({ parseSuccessCount: state.parseSuccessCount + 1 })),

  incrementParseFail: () =>
    set((state) => ({ parseFailCount: state.parseFailCount + 1 })),

  setSendSettings: (settings) => {
    set((state) => {
      const newSettings = { ...state.sendSettings, ...settings };
      saveSendSettings(newSettings);
      return { sendSettings: newSettings };
    });
  },

  reset: () =>
    set({
      connected: false,
      connecting: false,
      running: false,
      error: null,
      lines: [],
      stats: { bytes_received: 0, bytes_sent: 0 },
      lineIdCounter: 0,
    }),
}));

// Helper function: Parse serial data to lines
export function parseSerialData(
  data: number[],
  timestamp: number,
  direction: "rx" | "tx",
  pendingBuffer: { text: string; rawData: number[] }
): { lines: Omit<SerialLine, "id">[]; pending: { text: string; rawData: number[] } } {
  const lines: Omit<SerialLine, "id">[] = [];
  const text = new TextDecoder().decode(new Uint8Array(data));
  const date = new Date(timestamp);

  // Combine with pending buffer
  const fullText = pendingBuffer.text + text;
  const fullRawData = [...pendingBuffer.rawData, ...data];

  // Split by newlines
  const parts = fullText.split(/\r?\n/);

  // Last part may be incomplete
  const lastPart = parts.pop() || "";

  // Calculate last part bytes
  const lastPartBytes = new TextEncoder().encode(lastPart);
  const lastRawData = fullRawData.slice(-lastPartBytes.length);

  // Process complete lines
  let currentOffset = 0;
  for (const part of parts) {
    if (part.trim()) {
      const lineBytes = new TextEncoder().encode(part);
      const lineRawData = fullRawData.slice(currentOffset, currentOffset + lineBytes.length);

      lines.push({
        timestamp: date,
        text: part,
        level: parseLogLevel(part),
        rawData: lineRawData,
        direction,
      });

      currentOffset += lineBytes.length + 1; // +1 for newline
    } else {
      currentOffset += 1; // empty line
    }
  }

  return {
    lines,
    pending: { text: lastPart, rawData: lastRawData },
  };
}

// Selector: Get filtered lines (deprecated - use useMemo in component instead)
// Keeping for backward compatibility but recommend using useMemo to avoid infinite loops
export function useFilteredSerialLines() {
  const lines = useSerialStore((state) => state.lines);
  const searchQuery = useSerialStore((state) => state.searchQuery);

  return useMemo(() => {
    let filtered = lines;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((line) =>
        line.text.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [lines, searchQuery]);
}
