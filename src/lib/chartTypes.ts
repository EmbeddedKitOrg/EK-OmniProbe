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
 * 通道：解析字段 + 显示样式 合一
 *
 * - key 是逻辑键（JSON key / KV key / 正则命名组 / 分隔符列名），同时也是 ChartDataPoint.values 里的键
 * - sourceIndex 仅在 parseMode === "delimiter" 时使用，表示读取分隔后第几列
 * - role 决定该通道是 Y 轴数据还是 X 轴（仅 xy-scatter 模式有意义），最多一个 "x"
 */
export interface Channel {
  key: string;
  sourceIndex?: number;
  name: string;
  unit?: string;
  color: string;
  visible: boolean;
  role?: "x" | "y";
}

/**
 * 旧版本兼容别名。Channel 结构上兼容 ChartSeries 的所有字段，
 * 因此现有渲染代码（SignalPlotCanvas 等）可以直接消费 Channel[]。
 */
export type ChartSeries = Channel;

/**
 * 解析模式
 */
export type ParseMode = "regex" | "delimiter" | "json" | "kv" | "auto";

/**
 * 图表类型
 */
export type ChartType = "waveform" | "line" | "bar" | "scatter" | "xy-scatter";

/**
 * 波形显示域
 */
export type SignalDomain = "time" | "fft";

/**
 * 图表配置
 */
export interface ChartConfig {
  /** 是否启用图表功能 */
  enabled: boolean;
  /** 解析模式 */
  parseMode: ParseMode;

  // 正则模式
  /** 正则表达式 */
  regexPattern: string;
  /** 正则标志，如 "g", "gi" */
  regexFlags?: string;

  // 分隔符模式
  /** 分隔符，如 ",", "\t", " " */
  delimiter: string;

  /** 通道（合并旧版 fields + series + jsonKeys + kvKeys + xAxisField） */
  channels: Channel[];

  // 图表配置
  /** 图表类型 */
  chartType: ChartType;
  /** 最大数据点数 */
  maxDataPoints: number;
  /** 渲染时最多显示多少个点，0 表示自动 */
  visiblePointLimit: number;
  /** 更新间隔（毫秒） */
  updateInterval: number;

  /** FFT 窗口大小 */
  fftWindowSize: number;
  /** 采样率（Hz，0 表示自动估算） */
  sampleRateHz: number;
  /** 波形示波器的默认显示域 */
  signalDomain: SignalDomain;

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
 * 分屏方向
 * vertical: 上下分屏
 * horizontal: 左右分屏
 */
export type SplitOrientation = "vertical" | "horizontal";

/**
 * 默认图表配置
 */
export const DEFAULT_CHART_CONFIG: ChartConfig = {
  enabled: false,
  parseMode: "auto",

  regexPattern: "",
  regexFlags: "",

  delimiter: ",",

  channels: [],

  chartType: "waveform",
  maxDataPoints: 4000,
  visiblePointLimit: 600,
  updateInterval: 33,
  fftWindowSize: 1024,
  sampleRateHz: 0,
  signalDomain: "time",

  showGrid: true,
  showLegend: true,
  showTooltip: true,
  animationEnabled: true,
};

/**
 * 预设颜色列表（用于自动分配通道颜色）
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

/**
 * 取所有可见的 Y 轴通道
 */
export function getVisibleYChannels(config: ChartConfig): Channel[] {
  return config.channels.filter((c) => (c.role ?? "y") === "y" && c.visible);
}

/**
 * 取 X 轴通道（仅 xy-scatter 模式有意义）
 */
export function getXChannel(config: ChartConfig): Channel | undefined {
  return config.channels.find((c) => c.role === "x");
}

/**
 * 把任意外部传入的对象（含旧版 series/fields/jsonKeys/kvKeys/xAxisField/xxxEnabled）
 * 折叠成新版 ChartConfig 的 channels 模型。
 *
 * 幂等：传入新版 shape（已含 channels 数组）时仅做字段补齐。
 */
export function migrateChartConfig(raw: unknown): ChartConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_CHART_CONFIG };
  }

  const source = raw as Record<string, unknown>;

  const enabled = typeof source.enabled === "boolean" ? source.enabled : DEFAULT_CHART_CONFIG.enabled;
  const parseMode = isParseMode(source.parseMode) ? source.parseMode : DEFAULT_CHART_CONFIG.parseMode;
  const chartType = isChartType(source.chartType) ? source.chartType : DEFAULT_CHART_CONFIG.chartType;
  const signalDomain = source.signalDomain === "fft" ? "fft" : DEFAULT_CHART_CONFIG.signalDomain;

  // 优先使用新版 channels；否则从旧字段拼回
  let channels: Channel[];
  if (Array.isArray(source.channels)) {
    channels = sanitizeChannels(source.channels);
  } else {
    channels = buildChannelsFromLegacy(source);
  }

  return {
    enabled,
    parseMode,
    regexPattern: typeof source.regexPattern === "string" ? source.regexPattern : "",
    regexFlags: typeof source.regexFlags === "string" ? source.regexFlags : "",
    delimiter:
      typeof source.delimiter === "string" && source.delimiter.length > 0
        ? source.delimiter
        : DEFAULT_CHART_CONFIG.delimiter,
    channels,
    chartType,
    maxDataPoints: clampInt(source.maxDataPoints, 100, Number.MAX_SAFE_INTEGER, DEFAULT_CHART_CONFIG.maxDataPoints),
    visiblePointLimit: clampInt(
      source.visiblePointLimit,
      0,
      Number.MAX_SAFE_INTEGER,
      DEFAULT_CHART_CONFIG.visiblePointLimit
    ),
    updateInterval: clampInt(source.updateInterval, 16, Number.MAX_SAFE_INTEGER, DEFAULT_CHART_CONFIG.updateInterval),
    fftWindowSize: clampInt(source.fftWindowSize, 32, 4096, DEFAULT_CHART_CONFIG.fftWindowSize),
    sampleRateHz: clampNumber(source.sampleRateHz, 0, Number.MAX_SAFE_INTEGER, 0),
    signalDomain,
    showGrid: source.showGrid !== false,
    showLegend: source.showLegend !== false,
    showTooltip: source.showTooltip !== false,
    animationEnabled: source.animationEnabled !== false,
  };
}

function sanitizeChannels(raw: unknown[]): Channel[] {
  const out: Channel[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const e = entry as Record<string, unknown>;
    if (typeof e.key !== "string" || !e.key) return;
    out.push({
      key: e.key,
      sourceIndex: typeof e.sourceIndex === "number" && e.sourceIndex >= 0 ? Math.floor(e.sourceIndex) : undefined,
      name: typeof e.name === "string" && e.name ? e.name : e.key,
      unit: typeof e.unit === "string" ? e.unit : undefined,
      color: typeof e.color === "string" && e.color ? e.color : PRESET_COLORS[index % PRESET_COLORS.length],
      visible: e.visible !== false,
      role: e.role === "x" ? "x" : "y",
    });
  });
  // 至多一个 x
  let xSeen = false;
  return out.map((c) => {
    if (c.role === "x") {
      if (xSeen) return { ...c, role: "y" as const };
      xSeen = true;
    }
    return c;
  });
}

function buildChannelsFromLegacy(source: Record<string, unknown>): Channel[] {
  const oldSeries = Array.isArray(source.series) ? (source.series as Array<Record<string, unknown>>) : [];
  const oldFields = Array.isArray(source.fields) ? (source.fields as Array<Record<string, unknown>>) : [];
  const oldJsonKeys = Array.isArray(source.jsonKeys) ? (source.jsonKeys as unknown[]) : [];
  const oldKvKeys = Array.isArray(source.kvKeys) ? (source.kvKeys as unknown[]) : [];
  const xAxisField = typeof source.xAxisField === "string" ? source.xAxisField : "";
  const parseMode = typeof source.parseMode === "string" ? source.parseMode : "auto";

  const seriesByKey = new Map<string, Record<string, unknown>>();
  for (const s of oldSeries) {
    const k = typeof s?.key === "string" ? s.key : "";
    if (k) seriesByKey.set(k, s);
  }

  const channels: Channel[] = [];
  const used = new Set<string>();

  const pushChannel = (input: Partial<Channel> & { key: string; sourceIndex?: number }) => {
    if (!input.key || used.has(input.key)) return;
    used.add(input.key);
    const existing = seriesByKey.get(input.key);
    channels.push({
      key: input.key,
      sourceIndex: input.sourceIndex,
      name: typeof existing?.name === "string" && existing.name ? existing.name : (input.name ?? input.key),
      unit: typeof existing?.unit === "string" ? existing.unit : input.unit,
      color:
        typeof existing?.color === "string" && existing.color
          ? existing.color
          : (input.color ?? PRESET_COLORS[channels.length % PRESET_COLORS.length]),
      visible: existing ? existing.visible !== false : input.visible !== false,
      role: input.key === xAxisField ? "x" : "y",
    });
  };

  // 分隔符模式：fields 是真相
  if (parseMode === "delimiter" && oldFields.length > 0) {
    oldFields.forEach((field, idx) => {
      if (!field || field.enabled === false) return;
      const name = typeof field.name === "string" ? field.name : `field${idx + 1}`;
      const sourceIndex = typeof field.index === "number" ? field.index : idx;
      pushChannel({ key: name, sourceIndex });
    });
  } else {
    // 其他模式：series 优先；其次 jsonKeys / kvKeys
    for (const s of oldSeries) {
      const k = typeof s?.key === "string" ? s.key : "";
      if (k) pushChannel({ key: k });
    }
    for (const k of oldJsonKeys) {
      if (typeof k === "string" && k) pushChannel({ key: k });
    }
    for (const k of oldKvKeys) {
      if (typeof k === "string" && k) pushChannel({ key: k });
    }
    // 分隔符 fields 也补一下（自动模式下可能两边都有）
    oldFields.forEach((field, idx) => {
      if (!field || field.enabled === false) return;
      const name = typeof field.name === "string" ? field.name : `field${idx + 1}`;
      const sourceIndex = typeof field.index === "number" ? field.index : idx;
      pushChannel({ key: name, sourceIndex });
    });
  }

  // X 轴字段如果还没出现，补一条
  if (xAxisField && !used.has(xAxisField)) {
    used.add(xAxisField);
    channels.push({
      key: xAxisField,
      name: xAxisField,
      color: PRESET_COLORS[channels.length % PRESET_COLORS.length],
      visible: true,
      role: "x",
    });
  }

  return channels;
}

function isParseMode(value: unknown): value is ParseMode {
  return value === "regex" || value === "delimiter" || value === "json" || value === "kv" || value === "auto";
}

function isChartType(value: unknown): value is ChartType {
  return value === "waveform" || value === "line" || value === "bar" || value === "scatter" || value === "xy-scatter";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
