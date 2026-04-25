/**
 * RTT 图表数据解析工具
 */

import type { ChartConfig, ChartDataPoint, Channel } from "./chartTypes";

/**
 * 解析结果
 */
export interface ParseResult {
  /** 是否成功 */
  success: boolean;
  /** 解析出的数据点 */
  dataPoint?: ChartDataPoint;
  /** 错误信息 */
  error?: string;
  /** 使用的解析方法 */
  method?: "regex" | "delimiter" | "json" | "kv";
}

/**
 * 匹配 key=value 对的全局正则。
 */
const KV_PAIR_REGEX = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

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
  channels?: Channel[]
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

    const filter = channels && channels.length > 0
      ? new Set(channels.map((c) => c.key))
      : null;

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
        timestamp: Date.now(),
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
  channels: Channel[]
): ParseResult {
  try {
    const parts = text.split(delimiter);
    const values: Record<string, number> = {};

    for (let i = 0; i < channels.length; i += 1) {
      const channel = channels[i];
      const sourceIndex = typeof channel.sourceIndex === "number" ? channel.sourceIndex : i;
      if (sourceIndex < 0 || sourceIndex >= parts.length) continue;

      const value = parts[sourceIndex].trim();
      const num = parseFloat(value);

      if (!isNaN(num)) {
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
        timestamp: Date.now(),
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
export function parseWithJson(
  text: string,
  channels?: Channel[]
): ParseResult {
  try {
    const data = JSON.parse(text);

    if (typeof data !== "object" || data === null) {
      return {
        success: false,
        error: "JSON 数据不是对象",
      };
    }

    const values: Record<string, number> = {};
    const targetKeys = channels && channels.length > 0
      ? channels.map((c) => c.key)
      : Object.keys(data);

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
        timestamp: Date.now(),
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
export function parseWithKv(
  text: string,
  channels?: Channel[]
): ParseResult {
  KV_PAIR_REGEX.lastIndex = 0;
  const filter = channels && channels.length > 0
    ? new Set(channels.map((c) => c.key))
    : null;
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
      timestamp: Date.now(),
      values,
    },
    method: "kv",
  };
}

/**
 * 自动解析（按 JSON → 正则 → KV → 分隔符 顺序尝试）
 */
export function parseAuto(
  text: string,
  config: ChartConfig
): ParseResult {
  const jsonResult = parseWithJson(text, config.channels);
  if (jsonResult.success) return jsonResult;

  if (config.regexPattern) {
    const regexResult = parseWithRegex(
      text,
      config.regexPattern,
      config.regexFlags,
      config.channels
    );
    if (regexResult.success) return regexResult;
  }

  const kvResult = parseWithKv(text, config.channels);
  if (kvResult.success) return kvResult;

  if (config.channels.length > 0) {
    const delimiterResult = parseWithDelimiter(text, config.delimiter, config.channels);
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
export function parseChartData(
  text: string,
  config: ChartConfig
): ParseResult {
  if (!config.enabled) {
    return {
      success: false,
      error: "图表功能未启用",
    };
  }

  switch (config.parseMode) {
    case "regex":
      if (!config.regexPattern) {
        return {
          success: false,
          error: "正则表达式未配置",
        };
      }
      return parseWithRegex(
        text,
        config.regexPattern,
        config.regexFlags,
        config.channels
      );

    case "delimiter":
      if (config.channels.length === 0) {
        return {
          success: false,
          error: "分隔符模式未配置任何通道",
        };
      }
      return parseWithDelimiter(text, config.delimiter, config.channels);

    case "json":
      return parseWithJson(text, config.channels);

    case "kv":
      return parseWithKv(text, config.channels);

    case "auto":
      return parseAuto(text, config);

    default:
      return {
        success: false,
        error: "未知的解析模式",
      };
  }
}
