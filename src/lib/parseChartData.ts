/**
 * RTT 图表数据解析工具
 */

import type { ChartConfig, ChartDataPoint, Channel, ParseMode, PluginParseMode } from "./chartTypes";
import { isPluginParseMode } from "./chartTypes";

/**
 * 解析结果
 */
export interface ParseResult {
  /** 是否成功 */
  success: boolean;
  /** 是否因文本帧前缀不匹配而有意忽略 */
  ignored?: boolean;
  /** 解析出的数据点 */
  dataPoint?: ChartDataPoint;
  /** 错误信息 */
  error?: string;
  /** 使用的解析方法 */
  method?: string;
}

export interface ChartInputLine {
  text: string;
  timestamp: Date | number;
}

export type ChartLineParser = (text: string, config: ChartConfig, timestamp: number) => ParseResult;

export interface ChartParserPlugin {
  id: Exclude<ParseMode, "auto" | "justfloat">;
  label: string;
  parse: ChartLineParser;
}

export interface ChartParseBatch {
  points: ChartDataPoint[];
  success: number;
  fail: number;
}

/**
 * 匹配 key=value 对的全局正则。
 */
const KV_PAIR_REGEX = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** 返回剥离文本帧前缀后的载荷；不匹配时返回 null。 */
export function extractChartPayload(text: string, framePrefix: string): string | null {
  if (!framePrefix) return text;
  return text.startsWith(framePrefix) ? text.slice(framePrefix.length) : null;
}

/**
 * 使用正则表达式解析数据
 *
 * channels 仅用于约束输出键集合（若给出且非空，则只保留 channel.key 对应的命名捕获组）。
 * 实际值仍来自正则的命名捕获组。
 */
export function parseWithRegex(
  text: string,
  pattern: string,
  flags?: string,
  channels?: Channel[],
  timestamp = Date.now()
): ParseResult {
  try {
    const regex = new RegExp(pattern, flags);
    const match = regex.exec(text);

    if (!match || !match.groups) {
      return {
        success: false,
        error: "正则表达式未匹配或未使用命名捕获组",
      };
    }

    const filter = channels && channels.length > 0 ? new Set(channels.map((c) => c.key)) : null;

    const values: Record<string, number> = {};
    for (const [key, value] of Object.entries(match.groups)) {
      if (filter && !filter.has(key)) continue;
      const num = parseFloat(value);
      if (!isNaN(num)) {
        values[key] = num;
      }
    }

    if (Object.keys(values).length === 0) {
      return {
        success: false,
        error: "未提取到有效数值",
      };
    }

    return {
      success: true,
      dataPoint: {
        timestamp,
        values,
      },
      method: "regex",
    };
  } catch (error) {
    return {
      success: false,
      error: `正则表达式错误: ${error}`,
    };
  }
}

/**
 * 使用分隔符解析数据
 *
 * 每条 channel 对应一列；sourceIndex 缺失时退回到 channel 在数组里的位置。
 */
export function parseWithDelimiter(
  text: string,
  delimiter: string,
  channels: Channel[],
  timestamp = Date.now()
): ParseResult {
  try {
    const parts = text.split(delimiter);
    const values: Record<string, number> = {};

    for (let i = 0; i < channels.length; i += 1) {
      const channel = channels[i];
      const sourceIndex = typeof channel.sourceIndex === "number" ? channel.sourceIndex : i;
      if (sourceIndex < 0 || sourceIndex >= parts.length) continue;

      const value = parts[sourceIndex].trim();
      const num = Number(value);

      if (value !== "" && Number.isFinite(num)) {
        values[channel.key] = num;
      }
    }

    if (Object.keys(values).length === 0) {
      return {
        success: false,
        error: "未提取到有效数值",
      };
    }

    return {
      success: true,
      dataPoint: {
        timestamp,
        values,
      },
      method: "delimiter",
    };
  } catch (error) {
    return {
      success: false,
      error: `分隔符解析错误: ${error}`,
    };
  }
}

/**
 * 使用 JSON 解析数据
 *
 * channels 为空 → 自动提取所有数值字段；非空 → 只保留 channel.key 对应字段。
 */
export function parseWithJson(text: string, channels?: Channel[], timestamp = Date.now()): ParseResult {
  try {
    const data = JSON.parse(text);

    if (typeof data !== "object" || data === null) {
      return {
        success: false,
        error: "JSON 数据不是对象",
      };
    }

    const values: Record<string, number> = {};
    const targetKeys = channels && channels.length > 0 ? channels.map((c) => c.key) : Object.keys(data);

    for (const key of targetKeys) {
      const value = (data as Record<string, unknown>)[key];
      if (typeof value === "number" && !isNaN(value)) {
        values[key] = value;
      }
    }

    if (Object.keys(values).length === 0) {
      return {
        success: false,
        error: "未提取到有效数值",
      };
    }

    return {
      success: true,
      dataPoint: {
        timestamp,
        values,
      },
      method: "json",
    };
  } catch (error) {
    return {
      success: false,
      error: `JSON 解析错误: ${error}`,
    };
  }
}

/**
 * 解析 key=value 对（如 "seq=17 fft=1024 fs=255863 Hz mag=10145.5"）
 *
 * channels 为空 → 自动提取所有 key=number 对；非空 → 只保留 channel.key 对应键。
 */
export function parseWithKv(text: string, channels?: Channel[], timestamp = Date.now()): ParseResult {
  KV_PAIR_REGEX.lastIndex = 0;
  const filter = channels && channels.length > 0 ? new Set(channels.map((c) => c.key)) : null;
  const values: Record<string, number> = {};

  let match: RegExpExecArray | null;
  while ((match = KV_PAIR_REGEX.exec(text)) !== null) {
    const [, key, valueStr] = match;
    if (filter && !filter.has(key)) continue;
    const num = parseFloat(valueStr);
    if (Number.isFinite(num)) {
      values[key] = num;
    }
  }

  if (Object.keys(values).length === 0) {
    return {
      success: false,
      error: "未匹配到任何 key=value 数值对",
    };
  }

  return {
    success: true,
    dataPoint: {
      timestamp,
      values,
    },
    method: "kv",
  };
}

const chartParsers = new Map<ChartParserPlugin["id"], ChartParserPlugin>([
  [
    "delimiter",
    {
      id: "delimiter",
      label: "分隔符",
      parse: (text, config, timestamp) =>
        config.channels.length > 0
          ? parseWithDelimiter(text, config.delimiter, config.channels, timestamp)
          : { success: false, error: "分隔符模式未配置任何通道" },
    },
  ],
  [
    "json",
    { id: "json", label: "JSON", parse: (text, config, timestamp) => parseWithJson(text, config.channels, timestamp) },
  ],
  [
    "kv",
    {
      id: "kv",
      label: "KV (key=value)",
      parse: (text, config, timestamp) => parseWithKv(text, config.channels, timestamp),
    },
  ],
  [
    "regex",
    {
      id: "regex",
      label: "正则表达式",
      parse: (text, config, timestamp) =>
        config.regexPattern
          ? parseWithRegex(text, config.regexPattern, config.regexFlags, config.channels, timestamp)
          : { success: false, error: "正则表达式未配置" },
    },
  ],
]);

/** 注册文本解析插件；返回的函数仅卸载本次注册，便于测试和插件生命周期清理。 */
export function registerChartParser(plugin: ChartParserPlugin & { id: PluginParseMode }): () => void {
  if (!isPluginParseMode(plugin.id)) {
    throw new Error("解析插件 ID 必须使用 plugin: 前缀，且只能包含字母、数字、点、下划线和连字符");
  }
  const label = plugin.label.trim();
  if (!label) throw new Error("解析插件名称不能为空");
  if (chartParsers.has(plugin.id)) throw new Error(`解析插件已注册: ${plugin.id}`);

  const registered = { ...plugin, label };
  chartParsers.set(plugin.id, registered);
  return () => {
    if (chartParsers.get(plugin.id) === registered) chartParsers.delete(plugin.id);
  };
}

// ponytail: 注册表按应用启动时加载；需要运行时安装/卸载时再接入响应式插件状态。
export function listChartParsers(): ChartParserPlugin[] {
  return Array.from(chartParsers.values());
}

/**
 * 自动解析（按 JSON → 正则 → KV → 分隔符 顺序尝试）
 */
export function parseAuto(text: string, config: ChartConfig, timestamp = Date.now()): ParseResult {
  const jsonResult = parseWithJson(text, config.channels, timestamp);
  if (jsonResult.success) return jsonResult;

  if (config.regexPattern) {
    const regexResult = parseWithRegex(text, config.regexPattern, config.regexFlags, config.channels, timestamp);
    if (regexResult.success) return regexResult;
  }

  const kvResult = parseWithKv(text, config.channels, timestamp);
  if (kvResult.success) return kvResult;

  if (config.channels.length > 0) {
    const delimiterResult = parseWithDelimiter(text, config.delimiter, config.channels, timestamp);
    if (delimiterResult.success) return delimiterResult;
  }

  return {
    success: false,
    error: "所有解析方法均失败",
  };
}

/**
 * 主解析函数
 */
export function parseChartData(text: string, config: ChartConfig, timestamp = Date.now()): ParseResult {
  if (!config.enabled) {
    return {
      success: false,
      error: "图表功能未启用",
    };
  }

  const payload = config.parseMode === "justfloat" ? text : extractChartPayload(text, config.framePrefix);
  if (payload === null) {
    return {
      success: false,
      ignored: true,
      error: "文本帧前缀不匹配",
    };
  }

  if (config.parseMode === "auto") return parseAuto(payload, config, timestamp);
  if (config.parseMode === "justfloat") {
    return { success: false, error: "JustFloat 需要从串口原始字节流解析" };
  }

  const parser = chartParsers.get(config.parseMode);
  if (!parser) return { success: false, error: `解析器未注册: ${config.parseMode}` };

  try {
    return parser.parse(payload, config, timestamp);
  } catch (error) {
    return { success: false, error: `解析器 ${parser.label} 执行失败: ${error}` };
  }
}

/**
 * 批量解析文本行。parser 参数是后续内置/外部解析插件的最小注入点，
 * 当前默认复用内置 parseChartData。
 */
export function parseChartLines(
  lines: ChartInputLine[],
  config: ChartConfig,
  parser: ChartLineParser = parseChartData
): ChartParseBatch {
  const batch: ChartParseBatch = { points: [], success: 0, fail: 0 };

  for (const line of lines) {
    const timestamp = line.timestamp instanceof Date ? line.timestamp.getTime() : line.timestamp;
    const result = parser(line.text, config, timestamp);
    if (result.success && result.dataPoint) {
      batch.points.push(result.dataPoint);
      batch.success += 1;
    } else if (!result.ignored) {
      batch.fail += 1;
    }
  }

  return batch;
}
