import { create } from "zustand";
import type { RxFramingSettings } from "@/lib/serialTypes";
import { DEFAULT_RX_FRAMING } from "@/lib/serialTypes";
import type { RttChannel, RttLine, RttScanMode } from "@/lib/types";
import type { ColorParserConfig } from "@/lib/rttColorParser";
import { loadColorParserConfig, saveColorParserConfig } from "@/lib/rttColorParser";
import type { ChartConfig, ChartDataPoint, ViewMode, SplitOrientation } from "@/lib/chartTypes";
import { DEFAULT_CHART_CONFIG, migrateChartConfig } from "@/lib/chartTypes";
import { TelemetryFilterState, resolveTelemetryProcessing } from "@/lib/telemetry";
import { startSessionRecording, stopSessionRecording } from "@/lib/sessionCapture";
import { TriggerDetector, stepTriggerCapture } from "@/lib/triggerCapture";
import {
  loadFromStorage,
  saveToStorage,
  loadStringFromStorage,
  loadNumberFromStorage,
  saveNumberToStorage,
} from "@/lib/storage";

// 图表配置持久化
const CHART_CONFIG_KEY = "rtt_chart_config";
const VIEW_MODE_KEY = "rtt_view_mode";
const SPLIT_RATIO_KEY = "rtt_split_ratio";
const SPLIT_ORIENTATION_KEY = "rtt_split_orientation";
const RTT_RX_FRAMING_KEY = "rtt_rx_framing";
let splitRatioSaveTimer: ReturnType<typeof setTimeout> | undefined;

// 增量滤波状态。挂在模块作用域而不是 store state 里：它是可变的处理器状态，
// 不参与渲染，放进 state 只会让每次 set 都被当成变更。
const telemetryFilter = new TelemetryFilterState();

// 触发检测状态机。同为可变采集状态，不参与渲染，故与滤波器一样放模块作用域。
const triggerDetector = new TriggerDetector();

const VIEW_MODE_VALUES = ["text", "chart", "split"] as const;
const SPLIT_ORIENTATION_VALUES = ["vertical", "horizontal"] as const;

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
  splitOrientation: SplitOrientation;

  // 图表数据
  chartData: ChartDataPoint[]; // 图表数据点
  processedChartData: ChartDataPoint[]; // 共享处理结果；chartData 始终保留原始数值
  filterActive: boolean;
  chartConfig: ChartConfig; // 图表配置
  chartPaused: boolean; // 图表是否冻结显示（后台仍继续缓存）

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
  setSplitOrientation: (orientation: SplitOrientation) => void;
  setChartConfig: (config: ChartConfig) => void; // 新增：设置图表配置
  addChartData: (data: ChartDataPoint) => void; // 新增：添加图表数据
  addChartDataBatch: (points: ChartDataPoint[]) => void; // 批量添加图表数据，单次 setState
  clearChartData: () => void; // 新增：清空图表数据

  /** 会话录制开关。录制器本身在 lib/sessionCapture.ts 的模块作用域里。 */
  /** 接收分帧设置：决定字节流如何被切成文本行 */
  rxFraming: RxFramingSettings;
  setRxFraming: (settings: Partial<RxFramingSettings>) => void;

  /** 最近一次触发点的时间戳；供波形标记触发位置。未触发过为 null。 */
  triggeredAt: number | null;
  /** 重新武装触发器：清除冻结状态，回到待触发 */
  rearmTrigger: () => void;

  sessionRecording: boolean;
  setSessionRecording: (recording: boolean) => void;
  setChartPaused: (paused: boolean) => void; // 新增：设置图表冻结状态
  incrementParseSuccess: () => void; // 新增：增加解析成功计数
  incrementParseFail: () => void; // 新增：增加解析失败计数
  incrementParseCounts: (success: number, fail: number) => void; // 批量更新解析计数
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
  splitOrientation: loadStringFromStorage(SPLIT_ORIENTATION_KEY, SPLIT_ORIENTATION_VALUES, "vertical"),
  chartData: [], // 新增：图表数据
  processedChartData: [],
  filterActive: false,
  chartConfig: migrateChartConfig(loadFromStorage(CHART_CONFIG_KEY, DEFAULT_CHART_CONFIG)),
  chartPaused: false, // 新增：图表冻结状态
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
    set({ splitRatio });
    clearTimeout(splitRatioSaveTimer);
    splitRatioSaveTimer = setTimeout(() => saveNumberToStorage(SPLIT_RATIO_KEY, splitRatio), 150);
  },

  setSplitOrientation: (splitOrientation) => {
    saveToStorage(SPLIT_ORIENTATION_KEY, splitOrientation);
    set({ splitOrientation });
  },

  setChartConfig: (chartConfig) => {
    const normalizedConfig = migrateChartConfig(chartConfig);
    saveToStorage(CHART_CONFIG_KEY, normalizedConfig);
    set((state) => {
      const chartData = state.chartData.slice(-normalizedConfig.maxDataPoints);
      const processing = resolveTelemetryProcessing(chartData, normalizedConfig.channels, normalizedConfig.dataFilter);
      return {
        chartConfig: normalizedConfig,
        chartData: processing.rawData,
        processedChartData: processing.processedData,
        filterActive: processing.filterActive,
      };
    });
  },

  addChartData: (data) =>
    set((state) => {
      const processing = telemetryFilter.append(
        state.chartData,
        [data],
        state.chartConfig.maxDataPoints,
        state.chartConfig.channels,
        state.chartConfig.dataFilter
      );
      // 触发捕获：条件成立并凑够后置样本时冻结图表并按视图模式取数据
      const triggerPatch = stepTriggerCapture(triggerDetector, processing.rawData, [data], state.chartConfig.trigger);

      return {
        chartData: triggerPatch?.chartData ?? processing.rawData,
        processedChartData: processing.processedData,
        filterActive: processing.filterActive,
        ...(triggerPatch ? { chartPaused: true, triggeredAt: triggerPatch.triggeredAt } : {}),
      };
    }),

  addChartDataBatch: (points) =>
    set((state) => {
      if (points.length === 0) return state;
      const processing = telemetryFilter.append(
        state.chartData,
        points,
        state.chartConfig.maxDataPoints,
        state.chartConfig.channels,
        state.chartConfig.dataFilter
      );
      // 触发捕获：条件成立并凑够后置样本时冻结图表并按视图模式取数据
      const triggerPatch = stepTriggerCapture(triggerDetector, processing.rawData, points, state.chartConfig.trigger);

      return {
        chartData: triggerPatch?.chartData ?? processing.rawData,
        processedChartData: processing.processedData,
        filterActive: processing.filterActive,
        ...(triggerPatch ? { chartPaused: true, triggeredAt: triggerPatch.triggeredAt } : {}),
      };
    }),

  rxFraming: loadFromStorage(RTT_RX_FRAMING_KEY, DEFAULT_RX_FRAMING),
  setRxFraming: (settings) =>
    set((state) => {
      const next = { ...state.rxFraming, ...settings };
      saveToStorage(RTT_RX_FRAMING_KEY, next);
      return { rxFraming: next };
    }),

  triggeredAt: null,
  rearmTrigger: () => {
    triggerDetector.arm();
    set({ chartPaused: false, triggeredAt: null });
  },

  sessionRecording: false,
  setSessionRecording: (recording) => {
    if (recording) startSessionRecording("rtt");
    else stopSessionRecording("rtt");
    set({ sessionRecording: recording });
  },

  clearChartData: () => {
    telemetryFilter.reset();
    triggerDetector.reset();
    set({
      chartData: [],
      processedChartData: [],
      filterActive: false,
      parseSuccessCount: 0,
      parseFailCount: 0,
      triggeredAt: null,
    });
  },

  setChartPaused: (chartPaused) => set({ chartPaused }),

  incrementParseSuccess: () => set((state) => ({ parseSuccessCount: state.parseSuccessCount + 1 })),

  incrementParseFail: () => set((state) => ({ parseFailCount: state.parseFailCount + 1 })),

  incrementParseCounts: (success, fail) =>
    set((state) => {
      if (success === 0 && fail === 0) return state;
      return {
        parseSuccessCount: state.parseSuccessCount + success,
        parseFailCount: state.parseFailCount + fail,
      };
    }),

  setScanMode: (scanMode) => set({ scanMode }),

  setScanAddress: (scanAddress) => set({ scanAddress }),

  setPollInterval: (pollInterval) => set({ pollInterval }),

  addBytes: (count) => set((state) => ({ totalBytes: state.totalBytes + count })),

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
