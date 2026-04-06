import { create } from "zustand";
import type {
  SerialConfig,
  SerialLine,
  SerialStats,
  DataSourceType,
  LineEnding,
  Encoding,
  LocalSerialConfig,
  TcpSerialConfig,
  SerialTerminalLine,
  SerialTextViewMode,
  SerialTerminalSettings,
} from "@/lib/serialTypes";
import type { ColorParserConfig } from "@/lib/rttColorParser";
import { loadColorParserConfig, saveColorParserConfig } from "@/lib/rttColorParser";
import type { ChartConfig, ChartDataPoint, ViewMode } from "@/lib/chartTypes";
import { DEFAULT_CHART_CONFIG } from "@/lib/chartTypes";
import { parseLogLevel } from "@/lib/utils";
import {
  loadBooleanFromStorage,
  loadFromStorage,
  saveToStorage,
  loadStringFromStorage,
  loadNumberFromStorage,
  saveNumberToStorage,
} from "@/lib/storage";

// Persistence keys
const SERIAL_CONFIG_KEY = "serial_config";
const SERIAL_CHART_CONFIG_KEY = "serial_chart_config";
const SERIAL_VIEW_MODE_KEY = "serial_view_mode";
const SERIAL_SPLIT_RATIO_KEY = "serial_split_ratio";
const SERIAL_SEND_SETTINGS_KEY = "serial_send_settings";
const SERIAL_SHOW_DIRECTION_PREFIX_KEY = "serial_show_direction_prefix";
const SERIAL_TEXT_VIEW_MODE_KEY = "serial_text_view_mode";
const SERIAL_TERMINAL_SETTINGS_KEY = "serial_terminal_settings";
const SERIAL_TERMINAL_SETTINGS_VERSION_KEY = "serial_terminal_settings_version";
const SERIAL_TERMINAL_SETTINGS_VERSION = 2;

const VIEW_MODE_VALUES = ["text", "chart", "split"] as const;
const TEXT_VIEW_MODE_VALUES = ["log", "terminal"] as const;
const ANSI_ESCAPE_SEQUENCE_REGEX = /^\x1b\[[0-?]*[ -/]*[@-~]/;

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

type TerminalUnit =
  | { kind: "char"; value: string }
  | { kind: "ansi"; value: string };

type TerminalToken =
  | { type: "char"; value: string }
  | { type: "ansi"; value: string }
  | { type: "cr" }
  | { type: "lf" }
  | { type: "bs" };

const defaultSerialConfigBundle = {
  local: defaultLocalConfig,
  tcp: defaultTcpConfig,
  activeType: "local" as DataSourceType,
};
const defaultSendSettings: SendSettings = { encoding: "utf-8", lineEnding: "lf", hexMode: false };
const defaultTerminalSettings: SerialTerminalSettings = { localEcho: false, interceptShortcuts: true };

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
  showDirectionPrefix: boolean;
  splitByDirection: boolean;
  searchQuery: string;
  displayMode: "text" | "hex";
  colorParserConfig: ColorParserConfig;
  textViewMode: SerialTextViewMode;

  // Terminal state
  terminalLines: SerialTerminalLine[];
  terminalActiveLine: string;
  terminalActiveUnits: TerminalUnit[];
  terminalCursorColumn: number;
  terminalPendingEscape: string;
  terminalLineCounter: number;
  maxTerminalLines: number;
  terminalSettings: SerialTerminalSettings;

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
  setShowDirectionPrefix: (show: boolean) => void;
  setSplitByDirection: (split: boolean) => void;
  setSearchQuery: (query: string) => void;
  setDisplayMode: (mode: "text" | "hex") => void;
  setColorParserConfig: (config: ColorParserConfig) => void;
  setTextViewMode: (mode: SerialTextViewMode) => void;

  appendTerminalChunk: (text: string) => void;
  clearTerminalBuffer: () => void;
  setTerminalSettings: (settings: Partial<SerialTerminalSettings>) => void;

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

const savedConfig = loadFromStorage(SERIAL_CONFIG_KEY, defaultSerialConfigBundle);
const savedSendSettings = loadFromStorage(SERIAL_SEND_SETTINGS_KEY, defaultSendSettings);
const savedTerminalSettingsVersion = loadNumberFromStorage(
  SERIAL_TERMINAL_SETTINGS_VERSION_KEY,
  0,
  (value) => value >= 0
);
const loadedTerminalSettings = loadFromStorage(
  SERIAL_TERMINAL_SETTINGS_KEY,
  defaultTerminalSettings
);
const savedTerminalSettings: SerialTerminalSettings =
  savedTerminalSettingsVersion < SERIAL_TERMINAL_SETTINGS_VERSION
    ? {
        ...loadedTerminalSettings,
        localEcho: false,
      }
    : loadedTerminalSettings;

if (savedTerminalSettingsVersion < SERIAL_TERMINAL_SETTINGS_VERSION) {
  saveToStorage(SERIAL_TERMINAL_SETTINGS_KEY, savedTerminalSettings);
  saveNumberToStorage(SERIAL_TERMINAL_SETTINGS_VERSION_KEY, SERIAL_TERMINAL_SETTINGS_VERSION);
}

function getVisibleLength(units: TerminalUnit[]) {
  return units.filter((unit) => unit.kind === "char").length;
}

function getVisibleUnitIndex(units: TerminalUnit[], visibleIndex: number) {
  let currentVisible = 0;

  for (let index = 0; index < units.length; index += 1) {
    if (units[index].kind !== "char") {
      continue;
    }

    if (currentVisible === visibleIndex) {
      return index;
    }

    currentVisible += 1;
  }

  return -1;
}

function getInsertionIndex(units: TerminalUnit[], cursorColumn: number) {
  let currentVisible = 0;

  for (let index = 0; index < units.length; index += 1) {
    if (units[index].kind !== "char") {
      continue;
    }

    if (currentVisible === cursorColumn) {
      return index;
    }

    currentVisible += 1;
  }

  return units.length;
}

function unitsToText(units: TerminalUnit[]) {
  return units.map((unit) => unit.value).join("");
}

function tokenizeTerminalChunk(
  text: string,
  pendingEscape: string
): { tokens: TerminalToken[]; pendingEscape: string } {
  const tokens: TerminalToken[] = [];
  const combined = pendingEscape + text;
  let index = 0;

  while (index < combined.length) {
    const char = combined[index];

    if (char === "\x1b") {
      const match = combined.slice(index).match(ANSI_ESCAPE_SEQUENCE_REGEX);
      if (!match) {
        return { tokens, pendingEscape: combined.slice(index) };
      }

      tokens.push({ type: "ansi", value: match[0] });
      index += match[0].length;
      continue;
    }

    if (char === "\r") {
      tokens.push({ type: "cr" });
      index += 1;
      continue;
    }

    if (char === "\n") {
      tokens.push({ type: "lf" });
      index += 1;
      continue;
    }

    if (char === "\b") {
      tokens.push({ type: "bs" });
      index += 1;
      continue;
    }

    tokens.push({ type: "char", value: char });
    index += 1;
  }

  return { tokens, pendingEscape: "" };
}

function processTerminalChunk(
  text: string,
  state: Pick<
    SerialState,
    | "terminalLines"
    | "terminalActiveUnits"
    | "terminalCursorColumn"
    | "terminalPendingEscape"
    | "terminalLineCounter"
    | "maxTerminalLines"
  >
) {
  const lines = [...state.terminalLines];
  const activeUnits = [...state.terminalActiveUnits];
  let cursorColumn = state.terminalCursorColumn;
  let lineCounter = state.terminalLineCounter;

  const pushCommittedLine = () => {
    lineCounter += 1;
    lines.push({
      id: lineCounter,
      text: unitsToText(activeUnits),
    });

    if (lines.length > state.maxTerminalLines) {
      lines.splice(0, lines.length - state.maxTerminalLines);
    }

    activeUnits.length = 0;
    cursorColumn = 0;
  };

  const { tokens, pendingEscape } = tokenizeTerminalChunk(text, state.terminalPendingEscape);

  for (const token of tokens) {
    if (token.type === "cr") {
      cursorColumn = 0;
      continue;
    }

    if (token.type === "lf") {
      pushCommittedLine();
      continue;
    }

    if (token.type === "bs") {
      if (cursorColumn === 0) {
        continue;
      }

      cursorColumn -= 1;
      const removeIndex = getVisibleUnitIndex(activeUnits, cursorColumn);
      if (removeIndex >= 0) {
        activeUnits.splice(removeIndex, 1);
      }
      continue;
    }

    if (token.type === "ansi") {
      const insertionIndex = getInsertionIndex(activeUnits, cursorColumn);
      activeUnits.splice(insertionIndex, 0, { kind: "ansi", value: token.value });
      continue;
    }

    const visibleLength = getVisibleLength(activeUnits);
    if (cursorColumn < visibleLength) {
      const replaceIndex = getVisibleUnitIndex(activeUnits, cursorColumn);
      if (replaceIndex >= 0) {
        activeUnits[replaceIndex] = { kind: "char", value: token.value };
      }
    } else {
      const insertionIndex = getInsertionIndex(activeUnits, cursorColumn);
      activeUnits.splice(insertionIndex, 0, { kind: "char", value: token.value });
    }

    cursorColumn += 1;
  }

  return {
    terminalLines: lines,
    terminalActiveUnits: activeUnits,
    terminalActiveLine: unitsToText(activeUnits),
    terminalCursorColumn: cursorColumn,
    terminalPendingEscape: pendingEscape,
    terminalLineCounter: lineCounter,
  };
}

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
  showDirectionPrefix: loadBooleanFromStorage(SERIAL_SHOW_DIRECTION_PREFIX_KEY, true),
  splitByDirection: false,
  searchQuery: "",
  displayMode: "text",
  colorParserConfig: loadColorParserConfig(),
  textViewMode: loadStringFromStorage(SERIAL_TEXT_VIEW_MODE_KEY, TEXT_VIEW_MODE_VALUES, "log"),

  terminalLines: [],
  terminalActiveLine: "",
  terminalActiveUnits: [],
  terminalCursorColumn: 0,
  terminalPendingEscape: "",
  terminalLineCounter: 0,
  maxTerminalLines: 4000,
  terminalSettings: savedTerminalSettings,

  viewMode: loadStringFromStorage(SERIAL_VIEW_MODE_KEY, VIEW_MODE_VALUES, "text"),
  splitRatio: loadNumberFromStorage(SERIAL_SPLIT_RATIO_KEY, 0.4, (n) => n >= 0 && n <= 1),

  chartData: [],
  chartConfig: {
    ...DEFAULT_CHART_CONFIG,
    ...loadFromStorage(SERIAL_CHART_CONFIG_KEY, DEFAULT_CHART_CONFIG),
  },
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
      saveToStorage(SERIAL_CONFIG_KEY, {
        local: newLocal,
        tcp: state.tcpConfig,
        activeType: state.activeSourceType,
      });
      return { localConfig: newLocal };
    });
  },

  setTcpConfig: (config) => {
    set((state) => {
      const newTcp = { ...state.tcpConfig, ...config };
      saveToStorage(SERIAL_CONFIG_KEY, {
        local: state.localConfig,
        tcp: newTcp,
        activeType: state.activeSourceType,
      });
      return { tcpConfig: newTcp };
    });
  },

  setActiveSourceType: (type) => {
    set((state) => {
      saveToStorage(SERIAL_CONFIG_KEY, {
        local: state.localConfig,
        tcp: state.tcpConfig,
        activeType: type,
      });
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

  clearLines: () =>
    set({
      lines: [],
      lineIdCounter: 0,
      stats: { bytes_received: 0, bytes_sent: 0 },
      terminalLines: [],
      terminalActiveLine: "",
      terminalActiveUnits: [],
      terminalCursorColumn: 0,
      terminalPendingEscape: "",
      terminalLineCounter: 0,
    }),

  updateStats: (stats) => set({ stats }),

  setAutoScroll: (autoScroll) => set({ autoScroll }),
  setShowTimestamp: (showTimestamp) => set({ showTimestamp }),
  setShowDirectionPrefix: (showDirectionPrefix) => {
    saveToStorage(SERIAL_SHOW_DIRECTION_PREFIX_KEY, showDirectionPrefix);
    set({ showDirectionPrefix });
  },
  setSplitByDirection: (splitByDirection) => set({ splitByDirection }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setDisplayMode: (displayMode) => set({ displayMode }),

  setColorParserConfig: (colorParserConfig) => {
    saveColorParserConfig(colorParserConfig);
    set({ colorParserConfig });
  },

  setTextViewMode: (textViewMode) => {
    saveToStorage(SERIAL_TEXT_VIEW_MODE_KEY, textViewMode);
    set({ textViewMode });
  },

  appendTerminalChunk: (text) =>
    set((state) => processTerminalChunk(text, state)),

  clearTerminalBuffer: () =>
    set({
      terminalLines: [],
      terminalActiveLine: "",
      terminalActiveUnits: [],
      terminalCursorColumn: 0,
      terminalPendingEscape: "",
      terminalLineCounter: 0,
    }),

  setTerminalSettings: (settings) => {
    set((state) => {
      const nextSettings = { ...state.terminalSettings, ...settings };
      saveToStorage(SERIAL_TERMINAL_SETTINGS_KEY, nextSettings);
      return { terminalSettings: nextSettings };
    });
  },

  setViewMode: (viewMode) => {
    saveToStorage(SERIAL_VIEW_MODE_KEY, viewMode);
    set({ viewMode });
  },

  setSplitRatio: (splitRatio) => {
    saveNumberToStorage(SERIAL_SPLIT_RATIO_KEY, splitRatio);
    set({ splitRatio });
  },

  setChartConfig: (chartConfig) => {
    const normalizedConfig = {
      ...DEFAULT_CHART_CONFIG,
      ...chartConfig,
    };
    saveToStorage(SERIAL_CHART_CONFIG_KEY, normalizedConfig);
    set({ chartConfig: normalizedConfig });
  },

  addChartData: (data) =>
    set((state) => {
      if (state.chartPaused) {
        return state;
      }
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
      saveToStorage(SERIAL_SEND_SETTINGS_KEY, newSettings);
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
      terminalLines: [],
      terminalActiveLine: "",
      terminalActiveUnits: [],
      terminalCursorColumn: 0,
      terminalPendingEscape: "",
      terminalLineCounter: 0,
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
