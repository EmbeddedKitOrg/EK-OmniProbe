import type { DataFilterConfig } from "./chartTypes";
import { resolveChartProcessing } from "./chartFilter";

/** 与具体展示无关的内部数值采样。 */
export interface TelemetrySample {
  timestamp: number;
  values: Record<string, number>;
}

/** 解析器和接收管线之间传递的标准批次。 */
export interface TelemetryBatch {
  points: TelemetrySample[];
  success: number;
  fail: number;
}

/** 处理与展示共享的通道描述；展示层可在此基础上增加样式。 */
export interface TelemetryChannelDescriptor {
  key: string;
  sourceIndex?: number;
  name: string;
  unit?: string;
}

export interface TelemetryProcessingResult {
  rawData: TelemetrySample[];
  processedData: TelemetrySample[];
  filterActive: boolean;
}

export function appendTelemetrySamples(
  current: TelemetrySample[],
  incoming: TelemetrySample[],
  maxDataPoints: number
): TelemetrySample[] {
  if (incoming.length === 0) return current;
  if (maxDataPoints <= 0) return [];

  const merged = current.concat(incoming);
  return merged.length > maxDataPoints ? merged.slice(-maxDataPoints) : merged;
}

/** 从不可变的原始缓存生成一次共享处理结果。 */
export function resolveTelemetryProcessing(
  rawData: TelemetrySample[],
  channels: TelemetryChannelDescriptor[],
  config: DataFilterConfig
): TelemetryProcessingResult {
  const keys = new Set(channels.map(({ key }) => key));
  Object.keys(rawData[rawData.length - 1]?.values ?? {}).forEach((key) => keys.add(key));
  const processing = resolveChartProcessing(rawData, [...keys], config);

  return {
    rawData,
    processedData: processing.processedData,
    filterActive: processing.filterActive,
  };
}

export function appendTelemetryProcessing(
  current: TelemetrySample[],
  incoming: TelemetrySample[],
  maxDataPoints: number,
  channels: TelemetryChannelDescriptor[],
  config: DataFilterConfig
): TelemetryProcessingResult {
  return resolveTelemetryProcessing(appendTelemetrySamples(current, incoming, maxDataPoints), channels, config);
}
