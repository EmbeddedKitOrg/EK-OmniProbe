import { create } from "zustand";
import type { RttChannel, RttLine, RttScanMode } from "@/lib/types";
import type { ColorParserConfig } from "@/lib/rttColorParser";
import { loadColorParserConfig, saveColorParserConfig } from "@/lib/rttColorParser";
import type { ChartConfig, ChartDataPoint, ChartSeries, ViewMode } from "@/lib/chartTypes";
import { DEFAULT_CHART_CONFIG } from "@/lib/chartTypes";
import { parseLogLevel } from "@/lib/utils";
import { loadFromStorage, saveToStorage, loadStringFromStorage, loadNumberFromStorage, saveNumberToStorage } from "@/lib/storage";

// 图表配置持久化
const CHART_CONFIG_KEY = "rtt_chart_config";
const VIEW_MODE_KEY = "rtt_view_mode";
const SPLIT_RATIO_KEY = "rtt_split_ratio";

const VIEW_MODE_VALUES = ["text", "chart", "split"] as const;

interface RttState {
  // RTT 连接状态
  rttConnected: boolean;
  rttConnecting: boolean;

  // 运行状态
  isRunning: boolean;
  isPaused: boolean;
  error: string | null;

  // 通道信息
  upChannels: RttChannel[];
  downChannels: RttChannel[];
  selectedChannel: number; // -1 表示显示所有通道

  // 数据
  lines: RttLine[];
  maxLines: number;

  // 显示设置
  autoScroll: boolean;
  showTimestamp: boolean;
  searchQuery: string;
  displayMode: "text" | "hex"; // 新增：显示模式
  colorParserConfig: ColorParserConfig; // 新增：颜色解析配置

  // 视图模式
  viewMode: ViewMode; // 视图模式：仅文本/仅图表/分屏
  splitRatio: number; // 分屏比例（0-1，表示文本区域占比）

  // 图表数据
  chartData: ChartDataPoint[]; // 图表数据点
  chartConfig: ChartConfig; // 图表配置
  chartPaused: boolean; // 图表是否暂停更新

  // 统计信息
  parseSuccessCount: number; // 解析成功次数
  parseFailCount: number; // 解析失败次数

  // 配置
  scanMode: RttScanMode;
  scanAddress: number;
  pollInterval: number;

  // 统计
  totalBytes: number;
  lineIdCounter: number;

  // 操作
  setRttConnected: (connected: boolean) => void;
  setRttConnecting: (connecting: boolean) => void;
  setRunning: (running: boolean) => void;
  setPaused: (paused: boolean) => void;
  setError: (error: string | null) => void;
  setChannels: (upChannels: RttChannel[], downChannels: RttChannel[]) => void;
  selectChannel: (index: number) => void;
  addLine: (line: Omit<RttLine, "id">) => void;
  addLines: (lines: Omit<RttLine, "id">[]) => void;
  clearLines: () => void;
  setAutoScroll: (enabled: boolean) => void;
  setShowTimestamp: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  setDisplayMode: (mode: "text" | "hex") => void; // 新增
  setColorParserConfig: (config: ColorParserConfig) => void; // 新增
  setViewMode: (mode: ViewMode) => void; // 新增：设置视图模式
  setSplitRatio: (ratio: number) => void; // 新增：设置分屏比例
  setChartConfig: (config: ChartConfig) => void; // 新增：设置图表配置
  addChartData: (data: ChartDataPoint) => void; // 新增：添加图表数据
  clearChartData: () => void; // 新增：清空图表数据
  setChartPaused: (paused: boolean) => void; // 新增：设置图表暂停状态
  updateChartSeries: (series: ChartSeries[]) => void; // 新增：更新图表系列
  incrementParseSuccess: () => void; // 新增：增加解析成功计数
  incrementParseFail: () => void; // 新增：增加解析失败计数
  setScanMode: (mode: RttScanMode) => void;
  setScanAddress: (address: number) => void;
  setPollInterval: (interval: number) => void;
  addBytes: (count: number) => void;
  reset: () => void;
}


export const useRttStore = create<RttState>((set) => ({
  // 初始状态
  rttConnected: false,
  rttConnecting: false,
  isRunning: false,
  isPaused: false,
  error: null,
  upChannels: [],
  downChannels: [],
  selectedChannel: -1,
  lines: [],
  maxLines: 10000,
  autoScroll: true,
  showTimestamp: true,
  searchQuery: "",
  displayMode: "text", // 新增：默认文本模式
  colorParserConfig: loadColorParserConfig(), // 新增：从 localStorage 加载配置
  viewMode: loadStringFromStorage(VIEW_MODE_KEY, VIEW_MODE_VALUES, "text"), // 新增：从 localStorage 加载视图模式
  splitRatio: loadNumberFromStorage(SPLIT_RATIO_KEY, 0.4, (n) => n >= 0 && n <= 1), // 新增：从 localStorage 加载分屏比例
  chartData: [], // 新增：图表数据
  chartConfig: {
    ...DEFAULT_CHART_CONFIG,
    ...loadFromStorage(CHART_CONFIG_KEY, DEFAULT_CHART_CONFIG),
  }, // 新增：从 localStorage 加载图表配置
  chartPaused: false, // 新增：图表暂停状态
  parseSuccessCount: 0, // 新增：解析成功计数
  parseFailCount: 0, // 新增：解析失败计数
  scanMode: "auto",
  scanAddress: 0x20000000,
  pollInterval: 10, // 默认 10ms，更快的轮询
  totalBytes: 0,
  lineIdCounter: 0,

  setRttConnected: (rttConnected) => set({ rttConnected }),

  setRttConnecting: (rttConnecting) => set({ rttConnecting }),

  setRunning: (isRunning) => set({ isRunning, error: null }),

  setPaused: (isPaused) => set({ isPaused }),

  setError: (error) => set({ error, isRunning: false }),

  setChannels: (upChannels, downChannels) => set({ upChannels, downChannels }),

  selectChannel: (selectedChannel) => set({ selectedChannel }),

  addLine: (line) =>
    set((state) => {
      const id = state.lineIdCounter + 1;
      const newLine: RttLine = { ...line, id };
      const lines = [...state.lines, newLine].slice(-state.maxLines);
      return { lines, lineIdCounter: id };
    }),

  addLines: (newLines) =>
    set((state) => {
      let idCounter = state.lineIdCounter;
      const linesWithId: RttLine[] = newLines.map((line) => ({
        ...line,
        id: ++idCounter,
      }));
      const lines = [...state.lines, ...linesWithId].slice(-state.maxLines);
      return { lines, lineIdCounter: idCounter };
    }),

  clearLines: () => set({ lines: [], lineIdCounter: 0, totalBytes: 0 }),

  setAutoScroll: (autoScroll) => set({ autoScroll }),

  setShowTimestamp: (showTimestamp) => set({ showTimestamp }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setDisplayMode: (displayMode) => set({ displayMode }), // 新增

  setColorParserConfig: (colorParserConfig) => {
    saveColorParserConfig(colorParserConfig); // 保存到 localStorage
    set({ colorParserConfig });
  },

  setViewMode: (viewMode) => {
    saveToStorage(VIEW_MODE_KEY, viewMode);
    set({ viewMode });
  },

  setSplitRatio: (splitRatio) => {
    saveNumberToStorage(SPLIT_RATIO_KEY, splitRatio);
    set({ splitRatio });
  },

  setChartConfig: (chartConfig) => {
    const normalizedConfig = {
      ...DEFAULT_CHART_CONFIG,
      ...chartConfig,
    };
    saveToStorage(CHART_CONFIG_KEY, normalizedConfig);
    set({ chartConfig: normalizedConfig });
  },

  addChartData: (data) =>
    set((state) => {
      if (state.chartPaused) return state;
      const newData = [...state.chartData, data];
      // 限制最大数据点数
      const trimmedData = newData.slice(-state.chartConfig.maxDataPoints);
      return { chartData: trimmedData };
    }),

  clearChartData: () => set({ chartData: [], parseSuccessCount: 0, parseFailCount: 0 }),

  setChartPaused: (chartPaused) => set({ chartPaused }),

  updateChartSeries: (series) =>
    set((state) => ({
      chartConfig: { ...state.chartConfig, series },
    })),

  incrementParseSuccess: () =>
    set((state) => ({ parseSuccessCount: state.parseSuccessCount + 1 })),

  incrementParseFail: () =>
    set((state) => ({ parseFailCount: state.parseFailCount + 1 })),

  setScanMode: (scanMode) => set({ scanMode }),

  setScanAddress: (scanAddress) => set({ scanAddress }),

  setPollInterval: (pollInterval) => set({ pollInterval }),

  addBytes: (count) =>
    set((state) => ({ totalBytes: state.totalBytes + count })),

  reset: () =>
    set({
      rttConnected: false,
      rttConnecting: false,
      isRunning: false,
      isPaused: false,
      error: null,
      upChannels: [],
      downChannels: [],
      lines: [],
      totalBytes: 0,
      lineIdCounter: 0,
    }),
}));

// 辅助函数：将字节数据转换为文本行
export function parseRttData(
  data: number[],
  channel: number,
  timestamp: number,
  pendingBuffer: Map<number, { text: string; rawData: number[] }>
): Omit<RttLine, "id">[] {
  const lines: Omit<RttLine, "id">[] = [];
  const text = new TextDecoder().decode(new Uint8Array(data));
  const date = new Date(timestamp);

  // 获取该通道的未完成行
  const pending = pendingBuffer.get(channel) || { text: "", rawData: [] };
  const fullText = pending.text + text;
  const fullRawData = [...pending.rawData, ...data];

  // 按换行符分割
  const parts = fullText.split(/\r?\n/);

  // 最后一部分可能是不完整的行
  const lastPart = parts.pop() || "";

  // 计算最后一部分的字节长度
  const lastPartBytes = new TextEncoder().encode(lastPart);
  const lastRawData = fullRawData.slice(-lastPartBytes.length);
  pendingBuffer.set(channel, { text: lastPart, rawData: lastRawData });

  // 处理完整的行
  let currentOffset = 0;
  for (const part of parts) {
    if (part.trim()) {
      // 计算这一行的字节数据
      const lineBytes = new TextEncoder().encode(part);
      const lineRawData = fullRawData.slice(currentOffset, currentOffset + lineBytes.length);

      lines.push({
        channel,
        timestamp: date,
        text: part,
        level: parseLogLevel(part),
        rawData: lineRawData,
      });

      currentOffset += lineBytes.length + 1; // +1 for newline
    } else {
      currentOffset += 1; // empty line, just skip newline
    }
  }

  return lines;
}
