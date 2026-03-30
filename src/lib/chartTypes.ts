/**
 * RTT 图表相关类型定义
 */

/**
 * 图表数据点
 */
export interface ChartDataPoint {
  /** 时间戳（毫秒） */
  timestamp: number;
  /** 键值对，如 {temp: 25.5, humi: 60.2} */
  values: Record<string, number>;
}

/**
 * 图表数据系列
 */
export interface ChartSeries {
  /** 系列名称，如 "温度" */
  name: string;
  /** 数据键，如 "temp" */
  key: string;
  /** 颜色，如 "#ff0000" */
  color: string;
  /** 是否显示 */
  visible: boolean;
  /** 单位，如 "℃" */
  unit?: string;
}

/**
 * 解析模式
 */
export type ParseMode = "regex" | "delimiter" | "json" | "auto";

/**
 * 图表类型
 */
export type ChartType = "waveform" | "line" | "bar" | "scatter" | "xy-scatter";

/**
 * 波形显示域
 */
export type SignalDomain = "time" | "fft";

/**
 * 字段配置（用于分隔符模式）
 */
export interface FieldConfig {
  /** 字段索引（从 0 开始） */
  index: number;
  /** 字段名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 图表配置
 */
export interface ChartConfig {
  /** 是否启用图表功能 */
  enabled: boolean;
  /** 解析模式 */
  parseMode: ParseMode;

  // 正则模式配置
  /** 是否启用正则解析 */
  regexEnabled: boolean;
  /** 正则表达式 */
  regexPattern: string;
  /** 正则标志，如 "g", "gi" */
  regexFlags?: string;

  // 分隔符模式配置
  /** 是否启用分隔符解析 */
  delimiterEnabled: boolean;
  /** 分隔符，如 ",", "\t", " " */
  delimiter: string;
  /** 字段配置 */
  fields: FieldConfig[];

  // JSON 模式配置
  /** 是否启用 JSON 解析 */
  jsonEnabled: boolean;
  /** 要提取的键，空表示全部 */
  jsonKeys?: string[];

  // 图表配置
  /** 图表类型 */
  chartType: ChartType;
  /** 数据系列配置 */
  series: ChartSeries[];
  /** 最大数据点数 */
  maxDataPoints: number;
  /** 更新间隔（毫秒） */
  updateInterval: number;

  /** FFT 窗口大小 */
  fftWindowSize: number;
  /** 采样率（Hz，0 表示自动估算） */
  sampleRateHz: number;
  /** 波形示波器的默认显示域 */
  signalDomain: SignalDomain;

  // XY 散点图配置
  /** X 轴字段名（仅用于 xy-scatter 模式） */
  xAxisField?: string;

  // 显示配置
  /** 是否显示网格 */
  showGrid: boolean;
  /** 是否显示图例 */
  showLegend: boolean;
  /** 是否显示工具提示 */
  showTooltip: boolean;
  /** 是否启用动画 */
  animationEnabled: boolean;
}

/**
 * 视图模式
 */
export type ViewMode = "text" | "chart" | "split";

/**
 * 默认图表配置
 */
export const DEFAULT_CHART_CONFIG: ChartConfig = {
  enabled: false,
  parseMode: "auto",

  // 正则模式
  regexEnabled: false,
  regexPattern: "",
  regexFlags: "",

  // 分隔符模式
  delimiterEnabled: false,
  delimiter: ",",
  fields: [],

  // JSON 模式
  jsonEnabled: true,
  jsonKeys: [],

  // 图表配置
  chartType: "waveform",
  series: [],
  maxDataPoints: 4000,
  updateInterval: 33,
  fftWindowSize: 1024,
  sampleRateHz: 0,
  signalDomain: "time",

  // 显示配置
  showGrid: true,
  showLegend: true,
  showTooltip: true,
  animationEnabled: true,
};

/**
 * 预设颜色列表（用于自动分配系列颜色）
 */
export const PRESET_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#6366f1", // indigo
];
