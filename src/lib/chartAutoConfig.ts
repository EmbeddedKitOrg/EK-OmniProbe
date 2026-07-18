/**
 * RTT 图表智能自动配置
 */

import type { ChartConfig, Channel } from "./chartTypes";
import { PRESET_COLORS } from "./chartTypes";
import { parseChartData } from "./parseChartData";
import { parseJustFloatChunk } from "./parseJustFloat";

/**
 * 检测结果
 */
export interface DetectionResult {
  /** 检测到的格式类型 */
  format: "single-value" | "csv" | "xy-data" | "xy-with-seq" | "json" | "kv" | "regex" | "unknown";
  /** 建议的配置 */
  suggestedConfig: Partial<ChartConfig>;
  /** 检测到的字段/键 */
  detectedKeys: string[];
  /** 置信度 (0-1) */
  confidence: number;
  /** 说明 */
  description: string;
}

export interface ChartSample {
  text: string;
  rawData?: number[];
}

const KV_DETECT_REGEX = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/**
 * 智能检测数据格式
 */
export function detectDataFormat(sampleLines: string[]): DetectionResult {
  if (sampleLines.length === 0) {
    return {
      format: "unknown",
      suggestedConfig: {},
      detectedKeys: [],
      confidence: 0,
      description: "没有数据可分析",
    };
  }

  const singleValueResult = detectSingleValue(sampleLines);
  if (singleValueResult.confidence > 0.8) {
    return singleValueResult;
  }

  const xyWithSeqResult = detectXyWithSeq(sampleLines);
  if (xyWithSeqResult.confidence > 0.8) {
    return xyWithSeqResult;
  }

  const xyDataResult = detectXyData(sampleLines);
  if (xyDataResult.confidence > 0.8) {
    return xyDataResult;
  }

  const jsonResult = detectJson(sampleLines);
  if (jsonResult.confidence > 0.8) {
    return jsonResult;
  }

  const kvResult = detectKv(sampleLines);
  if (kvResult.confidence > 0.8) {
    return kvResult;
  }

  const csvResult = detectCsv(sampleLines);
  if (csvResult.confidence > 0.6) {
    return csvResult;
  }

  const results = [singleValueResult, xyWithSeqResult, xyDataResult, jsonResult, kvResult, csvResult];
  results.sort((a, b) => b.confidence - a.confidence);
  return results[0];
}

/**
 * 检测 key=value 格式（如 "seq=17 fft=1024 fs=255863 Hz mag=10145.5"）
 */
function detectKv(lines: string[]): DetectionResult {
  const trimmedLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (trimmedLines.length === 0) {
    return emptyDetection();
  }

  const keyOccurrences = new Map<string, number>();
  let validLineCount = 0;

  for (const line of trimmedLines) {
    KV_DETECT_REGEX.lastIndex = 0;
    const lineKeys = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = KV_DETECT_REGEX.exec(line)) !== null) {
      lineKeys.add(match[1]);
    }
    if (lineKeys.size >= 2) {
      validLineCount++;
      for (const key of lineKeys) {
        keyOccurrences.set(key, (keyOccurrences.get(key) ?? 0) + 1);
      }
    }
  }

  const confidence = validLineCount / trimmedLines.length;
  const stableKeys = Array.from(keyOccurrences.entries())
    .filter(([, count]) => count >= Math.max(1, Math.floor(validLineCount * 0.5)))
    .map(([key]) => key);

  if (confidence > 0.7 && stableKeys.length >= 2) {
    const channels = stableKeys.map((key, index) => buildYChannel(key, index));
    return {
      format: "kv",
      suggestedConfig: {
        enabled: true,
        parseMode: "kv",
        channels,
        chartType: "waveform",
        maxDataPoints: 4000,
      },
      detectedKeys: stableKeys,
      confidence,
      description: `检测到 key=value 格式，共 ${stableKeys.length} 个稳定数值字段`,
    };
  }

  return {
    format: "unknown",
    suggestedConfig: {},
    detectedKeys: [],
    confidence,
    description: "不是 KV 格式",
  };
}

/**
 * 检测单个数值格式
 */
function detectSingleValue(lines: string[]): DetectionResult {
  let validCount = 0;
  const trimmedLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);

  for (const line of trimmedLines) {
    if (/^-?\d+\.?\d*$/.test(line)) {
      validCount++;
    }
  }

  const confidence = trimmedLines.length > 0 ? validCount / trimmedLines.length : 0;

  if (confidence > 0.8) {
    return {
      format: "single-value",
      suggestedConfig: {
        enabled: true,
        parseMode: "delimiter",
        delimiter: ",",
        channels: [
          {
            key: "value",
            sourceIndex: 0,
            name: "数值",
            color: PRESET_COLORS[0],
            visible: true,
            role: "y",
          },
        ],
        chartType: "waveform",
        maxDataPoints: 4000,
      },
      detectedKeys: ["value"],
      confidence,
      description: `检测到单数值格式（${(confidence * 100).toFixed(0)}% 置信度）`,
    };
  }

  return {
    format: "unknown",
    suggestedConfig: {},
    detectedKeys: [],
    confidence,
    description: "不是单数值格式",
  };
}

/**
 * 检测 XY 数据格式（两列数值）
 */
function detectXyData(lines: string[]): DetectionResult {
  const delimiters = [",", "\t", " ", ";"];
  let bestDelimiter = ",";
  let bestConfidence = 0;

  const trimmedLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);

  for (const delimiter of delimiters) {
    let validCount = 0;
    for (const line of trimmedLines) {
      const parts = line
        .split(delimiter)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length === 2 && parts.every((p) => /^-?\d+\.?\d*$/.test(p))) {
        validCount++;
      }
    }
    const confidence = trimmedLines.length > 0 ? validCount / trimmedLines.length : 0;
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestDelimiter = delimiter;
    }
  }

  if (bestConfidence > 0.8) {
    return {
      format: "xy-data",
      suggestedConfig: {
        enabled: true,
        parseMode: "delimiter",
        delimiter: bestDelimiter,
        channels: [
          {
            key: "x",
            sourceIndex: 0,
            name: "X",
            color: PRESET_COLORS[8],
            visible: true,
            role: "x",
          },
          {
            key: "y",
            sourceIndex: 1,
            name: "Y",
            color: PRESET_COLORS[0],
            visible: true,
            role: "y",
          },
        ],
        chartType: "xy-scatter",
        maxDataPoints: 4000,
      },
      detectedKeys: ["x", "y"],
      confidence: bestConfidence,
      description: `检测到 ${describeDelimiter(bestDelimiter)} 分隔的 XY 数据格式（${(bestConfidence * 100).toFixed(0)}% 置信度）`,
    };
  }

  return {
    format: "unknown",
    suggestedConfig: {},
    detectedKeys: [],
    confidence: bestConfidence,
    description: "不是 XY 数据格式",
  };
}

/**
 * 检测 "序号, x, y" 三列纯数值格式（第 1 列单调递增的整数序号）
 *
 * 例：20,4997.32,122954.44
 */
function detectXyWithSeq(lines: string[]): DetectionResult {
  const delimiters = [",", "\t", " ", ";"];
  let bestDelimiter = ",";
  let bestConfidence = 0;
  let bestMonotonic = false;

  const trimmedLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (trimmedLines.length < 2) {
    return {
      format: "unknown",
      suggestedConfig: {},
      detectedKeys: [],
      confidence: 0,
      description: "样本太少",
    };
  }

  for (const delimiter of delimiters) {
    let validCount = 0;
    const seqValues: number[] = [];

    for (const line of trimmedLines) {
      const parts = line
        .split(delimiter)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length !== 3) continue;
      const isInt = /^-?\d+$/.test(parts[0]);
      const allNumeric = parts.every((p) => /^-?\d+\.?\d*$/.test(p));
      if (!isInt || !allNumeric) continue;
      validCount++;
      seqValues.push(parseInt(parts[0], 10));
    }

    const confidence = validCount / trimmedLines.length;
    let monotonic = false;
    if (seqValues.length >= 2) {
      monotonic = seqValues.every((v, i) => i === 0 || v >= seqValues[i - 1]);
    }

    if (confidence > bestConfidence || (confidence === bestConfidence && monotonic && !bestMonotonic)) {
      bestConfidence = confidence;
      bestDelimiter = delimiter;
      bestMonotonic = monotonic;
    }
  }

  if (bestConfidence > 0.8 && bestMonotonic) {
    return {
      format: "xy-with-seq",
      suggestedConfig: {
        enabled: true,
        parseMode: "delimiter",
        delimiter: bestDelimiter,
        channels: [
          {
            key: "seq",
            sourceIndex: 0,
            name: "序号",
            color: PRESET_COLORS[2],
            visible: false,
            role: "y",
          },
          {
            key: "x",
            sourceIndex: 1,
            name: "X",
            color: PRESET_COLORS[8],
            visible: true,
            role: "x",
          },
          {
            key: "y",
            sourceIndex: 2,
            name: "Y",
            color: PRESET_COLORS[0],
            visible: true,
            role: "y",
          },
        ],
        chartType: "xy-scatter",
        maxDataPoints: 4000,
      },
      detectedKeys: ["seq", "x", "y"],
      confidence: bestConfidence,
      description: `检测到 ${describeDelimiter(bestDelimiter)} 分隔的"序号, X, Y"三列格式`,
    };
  }

  return {
    format: "unknown",
    suggestedConfig: {},
    detectedKeys: [],
    confidence: bestConfidence,
    description: "不是 序号+XY 格式",
  };
}

/**
 * 检测 JSON 格式
 */
function detectJson(lines: string[]): DetectionResult {
  let validCount = 0;
  const allKeys = new Set<string>();
  const trimmedLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);

  for (const line of trimmedLines) {
    try {
      const data = JSON.parse(line);
      if (typeof data === "object" && data !== null) {
        validCount++;
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === "number") {
            allKeys.add(key);
          }
        }
      }
    } catch {
      // 不是 JSON
    }
  }

  const confidence = trimmedLines.length > 0 ? validCount / trimmedLines.length : 0;
  const detectedKeys = Array.from(allKeys);

  if (confidence > 0.8 && detectedKeys.length > 0) {
    const channels = detectedKeys.map((key, index) => buildYChannel(key, index));

    return {
      format: "json",
      suggestedConfig: {
        enabled: true,
        parseMode: "json",
        channels,
        chartType: "waveform",
        maxDataPoints: 4000,
      },
      detectedKeys,
      confidence,
      description: `检测到 JSON 格式，包含 ${detectedKeys.length} 个数值字段`,
    };
  }

  return {
    format: "unknown",
    suggestedConfig: {},
    detectedKeys: [],
    confidence,
    description: "不是 JSON 格式",
  };
}

/**
 * 检测 CSV 格式（逗号、制表符、空格分隔）
 */
function detectCsv(lines: string[]): DetectionResult {
  const delimiters = [",", "\t", " ", ";"];
  let bestDelimiter = ",";
  let bestConfidence = 0;
  let bestFieldCount = 0;

  const trimmedLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);

  for (const delimiter of delimiters) {
    let validCount = 0;
    let totalFields = 0;
    const fieldCounts: number[] = [];

    for (const line of trimmedLines) {
      const parts = line.split(delimiter);
      fieldCounts.push(parts.length);
      const numericParts = parts.filter((p) => /^-?\d+\.?\d*$/.test(p.trim()));
      if (numericParts.length === parts.length && parts.length > 1) {
        validCount++;
        totalFields += parts.length;
      }
    }

    const avgFieldCount = totalFields / validCount || 0;
    const consistentFields = fieldCounts.every((count) => Math.abs(count - avgFieldCount) < 1);

    const confidence = trimmedLines.length > 0 && consistentFields ? validCount / trimmedLines.length : 0;

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestDelimiter = delimiter;
      bestFieldCount = Math.round(avgFieldCount);
    }
  }

  if (bestConfidence > 0.6 && bestFieldCount > 1) {
    const channels: Channel[] = [];
    for (let i = 0; i < bestFieldCount; i++) {
      channels.push({
        key: `field${i + 1}`,
        sourceIndex: i,
        name: `字段${i + 1}`,
        color: PRESET_COLORS[i % PRESET_COLORS.length],
        visible: true,
        role: "y",
      });
    }

    return {
      format: "csv",
      suggestedConfig: {
        enabled: true,
        parseMode: "delimiter",
        delimiter: bestDelimiter,
        channels,
        chartType: "waveform",
        maxDataPoints: 4000,
      },
      detectedKeys: channels.map((c) => c.key),
      confidence: bestConfidence,
      description: `检测到 ${describeDelimiter(bestDelimiter)} 分隔的 CSV 格式，包含 ${bestFieldCount} 个字段`,
    };
  }

  return {
    format: "unknown",
    suggestedConfig: {},
    detectedKeys: [],
    confidence: bestConfidence,
    description: "不是 CSV 格式",
  };
}

/**
 * 应用自动配置
 */
export function applyAutoConfig(currentConfig: ChartConfig, detectionResult: DetectionResult): ChartConfig {
  return {
    ...currentConfig,
    ...detectionResult.suggestedConfig,
  };
}

/**
 * 通道为空时，用当前缓冲区样本预建通道；已有通道始终保留。
 */
export function populateEmptyChannelsFromSamples(config: ChartConfig, samples: ChartSample[]): ChartConfig {
  if (config.channels.length > 0 || samples.length === 0) return config;

  if (config.parseMode === "auto") {
    const detection = detectDataFormat(samples.map((sample) => sample.text));
    const channels = detection.suggestedConfig.channels;
    if (detection.confidence < 0.5 || !channels?.length) return config;

    return {
      ...config,
      parseMode: detection.suggestedConfig.parseMode ?? config.parseMode,
      delimiter: detection.suggestedConfig.delimiter ?? config.delimiter,
      chartType: detection.suggestedConfig.chartType ?? config.chartType,
      channels,
    };
  }

  const channels =
    config.parseMode === "delimiter"
      ? channelsFromDelimiter(samples, config.delimiter)
      : config.parseMode === "justfloat"
        ? channelsFromJustFloat(samples)
        : channelsFromConfiguredParser(config, samples);

  return channels.length > 0 ? { ...config, channels } : config;
}

function channelsFromConfiguredParser(config: ChartConfig, samples: ChartSample[]): Channel[] {
  const keys = new Set<string>();
  const parseConfig = { ...config, enabled: true, channels: [] };

  for (const sample of samples) {
    const result = parseChartData(sample.text, parseConfig);
    if (!result.success || !result.dataPoint) continue;
    Object.keys(result.dataPoint.values).forEach((key) => keys.add(key));
  }

  return Array.from(keys, (key, index) => buildYChannel(key, index));
}

function channelsFromDelimiter(samples: ChartSample[], delimiter: string): Channel[] {
  if (!delimiter) return [];

  const numericCounts: number[] = [];
  let lineCount = 0;
  for (const { text } of samples) {
    if (!text.trim()) continue;
    lineCount += 1;
    text.split(delimiter).forEach((value, index) => {
      if (value.trim() !== "" && Number.isFinite(Number(value.trim()))) {
        numericCounts[index] = (numericCounts[index] ?? 0) + 1;
      }
    });
  }

  const threshold = Math.max(1, Math.ceil(lineCount / 2));
  return numericCounts.flatMap((count, index) =>
    count >= threshold
      ? [
          {
            ...buildYChannel(`field${index + 1}`, index),
            sourceIndex: index,
            name: `字段${index + 1}`,
          },
        ]
      : []
  );
}

function channelsFromJustFloat(samples: ChartSample[]): Channel[] {
  let pending: number[] = [];
  for (const { rawData } of samples) {
    if (!rawData?.length) continue;
    const result = parseJustFloatChunk(rawData, pending);
    pending = result.pending;
    const count = result.frames[0]?.length ?? 0;
    if (count > 0) {
      return Array.from({ length: count }, (_, index) => ({
        ...buildYChannel(`ch${index + 1}`, index),
        sourceIndex: index,
        name: `通道 ${index + 1}`,
      }));
    }
  }
  return [];
}

function buildYChannel(key: string, index: number): Channel {
  return {
    key,
    name: key,
    color: PRESET_COLORS[index % PRESET_COLORS.length],
    visible: true,
    role: "y",
  };
}

function describeDelimiter(delimiter: string): string {
  if (delimiter === ",") return "逗号";
  if (delimiter === "\t") return "制表符";
  if (delimiter === " ") return "空格";
  if (delimiter === ";") return "分号";
  return `"${delimiter}"`;
}

function emptyDetection(): DetectionResult {
  return {
    format: "unknown",
    suggestedConfig: {},
    detectedKeys: [],
    confidence: 0,
    description: "没有数据可分析",
  };
}
