/**
 * RTT 图表智能自动配置
 */

import type { ChartConfig, FieldConfig, ChartSeries } from "./chartTypes";
import { PRESET_COLORS } from "./chartTypes";

/**
 * 检测结果
 */
export interface DetectionResult {
  /** 检测到的格式类型 */
  format: "single-value" | "csv" | "xy-data" | "json" | "regex" | "unknown";
  /** 建议的配置 */
  suggestedConfig: Partial<ChartConfig>;
  /** 检测到的字段/键 */
  detectedKeys: string[];
  /** 置信度 (0-1) */
  confidence: number;
  /** 说明 */
  description: string;
}

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

  // 1. 检测纯数值（单个数值）
  const singleValueResult = detectSingleValue(sampleLines);
  if (singleValueResult.confidence > 0.8) {
    return singleValueResult;
  }

  // 2. 检测 XY 数据格式（两列数值）
  const xyDataResult = detectXyData(sampleLines);
  if (xyDataResult.confidence > 0.8) {
    return xyDataResult;
  }

  // 3. 检测 JSON 格式
  const jsonResult = detectJson(sampleLines);
  if (jsonResult.confidence > 0.8) {
    return jsonResult;
  }

  // 4. 检测 CSV 格式（逗号、制表符、空格分隔）
  const csvResult = detectCsv(sampleLines);
  if (csvResult.confidence > 0.6) {
    return csvResult;
  }

  // 5. 返回最佳猜测
  const results = [singleValueResult, xyDataResult, jsonResult, csvResult];
  results.sort((a, b) => b.confidence - a.confidence);
  return results[0];
}

/**
 * 检测单个数值格式
 */
function detectSingleValue(lines: string[]): DetectionResult {
  let validCount = 0;
  const trimmedLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);

  for (const line of trimmedLines) {
    // 检查是否是纯数值（可能带正负号、小数点）
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
        delimiterEnabled: true,
        delimiter: ",", // 对于单值，分隔符不重要
        fields: [
          {
            index: 0,
            name: "value",
            enabled: true,
          },
        ],
        series: [
          {
            key: "value",
            name: "数值",
            color: PRESET_COLORS[0],
            visible: true,
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
      const parts = line.split(delimiter).map((p) => p.trim()).filter((p) => p.length > 0);

      // 必须恰好是两列
      if (parts.length === 2) {
        // 检查两列是否都是数值
        const isNum1 = /^-?\d+\.?\d*$/.test(parts[0]);
        const isNum2 = /^-?\d+\.?\d*$/.test(parts[1]);
        if (isNum1 && isNum2) {
          validCount++;
        }
      }
    }

    const confidence = trimmedLines.length > 0 ? validCount / trimmedLines.length : 0;
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestDelimiter = delimiter;
    }
  }

  if (bestConfidence > 0.8) {
    const delimiterName =
      bestDelimiter === ","
        ? "逗号"
        : bestDelimiter === "\t"
          ? "制表符"
          : bestDelimiter === " "
            ? "空格"
            : "分号";

    return {
      format: "xy-data",
      suggestedConfig: {
        enabled: true,
        parseMode: "delimiter",
        delimiterEnabled: true,
        delimiter: bestDelimiter,
        fields: [
          {
            index: 0,
            name: "x",
            enabled: true,
          },
          {
            index: 1,
            name: "y",
            enabled: true,
          },
        ],
        series: [
          {
            key: "y",
            name: "Y 值",
            color: PRESET_COLORS[0],
            visible: true,
          },
        ],
        chartType: "xy-scatter",
        xAxisField: "x",
        maxDataPoints: 4000,
      },
      detectedKeys: ["x", "y"],
      confidence: bestConfidence,
      description: `检测到 ${delimiterName} 分隔的 XY 数据格式（${(bestConfidence * 100).toFixed(0)}% 置信度）`,
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
        // 收集所有数值类型的键
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
    const series: ChartSeries[] = detectedKeys.map((key, index) => ({
      key,
      name: key,
      color: PRESET_COLORS[index % PRESET_COLORS.length],
      visible: true,
    }));

    return {
      format: "json",
      suggestedConfig: {
        enabled: true,
        parseMode: "json",
        jsonEnabled: true,
        jsonKeys: detectedKeys,
        series,
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

      // 检查是否所有部分都是数值
      const numericParts = parts.filter((p) => /^-?\d+\.?\d*$/.test(p.trim()));
      if (numericParts.length === parts.length && parts.length > 1) {
        validCount++;
        totalFields += parts.length;
      }
    }

    // 检查字段数是否一致
    const avgFieldCount = totalFields / validCount || 0;
    const consistentFields = fieldCounts.every(
      (count) => Math.abs(count - avgFieldCount) < 1
    );

    const confidence =
      trimmedLines.length > 0 && consistentFields ? validCount / trimmedLines.length : 0;

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestDelimiter = delimiter;
      bestFieldCount = Math.round(avgFieldCount);
    }
  }

  if (bestConfidence > 0.6 && bestFieldCount > 1) {
    const fields: FieldConfig[] = [];
    const series: ChartSeries[] = [];

    for (let i = 0; i < bestFieldCount; i++) {
      const fieldName = `field${i + 1}`;
      fields.push({
        index: i,
        name: fieldName,
        enabled: true,
      });
      series.push({
        key: fieldName,
        name: `字段${i + 1}`,
        color: PRESET_COLORS[i % PRESET_COLORS.length],
        visible: true,
      });
    }

    const delimiterName =
      bestDelimiter === ","
        ? "逗号"
        : bestDelimiter === "\t"
          ? "制表符"
          : bestDelimiter === " "
            ? "空格"
            : "分号";

    return {
      format: "csv",
      suggestedConfig: {
        enabled: true,
        parseMode: "delimiter",
        delimiterEnabled: true,
        delimiter: bestDelimiter,
        fields,
        series,
        chartType: "waveform",
        maxDataPoints: 4000,
      },
      detectedKeys: fields.map((f) => f.name),
      confidence: bestConfidence,
      description: `检测到 ${delimiterName} 分隔的 CSV 格式，包含 ${bestFieldCount} 个字段`,
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
export function applyAutoConfig(
  currentConfig: ChartConfig,
  detectionResult: DetectionResult
): ChartConfig {
  return {
    ...currentConfig,
    ...detectionResult.suggestedConfig,
  };
}
