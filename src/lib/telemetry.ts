import type { DataFilterConfig } from "./chartTypes";
import {
  createChannelProcessors,
  isDataFilterReady,
  resolveChartProcessing,
  runChannelProcessors,
  type ChannelProcessors,
} from "./chartFilter";

/** 与具体展示无关的内部数值采样。 */
export interface TelemetrySample {
  timestamp: number;
  values: Record<string, number>;
  /** SLCAN 解析附带的原始 CAN 帧；普通遥测样本不设置。 */
  canFrame?: CanFrameSample;
}

export interface CanFrameSample {
  id: number;
  extended: boolean;
  rtr: boolean;
  fd: boolean;
  brs: boolean;
  dlc: number;
  data: number[];
  /** 含固定 20% 位填充余量的帧位数估算。 */
  estimatedBits: number;
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
  const processing = resolveChartProcessing(rawData, resolveChannelKeys(rawData, channels), config);

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

function resolveChannelKeys(rawData: TelemetrySample[], channels: TelemetryChannelDescriptor[]): string[] {
  const keys = new Set(channels.map(({ key }) => key));
  Object.keys(rawData[rawData.length - 1]?.values ?? {}).forEach((key) => keys.add(key));
  return [...keys];
}

/**
 * 增量滤波状态。滤波器本身是有状态的（FIR 历史 / median 窗口 / SOS 的 z1z2），
 * 原先每来一批样本就重建处理器并重放整个缓冲区，代价是 O(缓冲区长度) × 每帧；
 * 这里把处理器留下来，稳态下只处理新到的样本。
 *
 * 判断能否走增量只看一件事：传入的 current 是否就是上次返回的 rawData（引用相等）。
 * 清空数据、切换配置、外部直接改写 chartData 都会让引用不同，从而自动退回全量重算，
 * 不依赖长度之类的启发式判断。
 */
export class TelemetryFilterState {
  private processors: ChannelProcessors | null = null;
  private signature = "";
  private lastRaw: TelemetrySample[] | null = null;
  private lastProcessed: TelemetrySample[] = [];

  reset(): void {
    this.processors = null;
    this.signature = "";
    this.lastRaw = null;
    this.lastProcessed = [];
  }

  append(
    current: TelemetrySample[],
    incoming: TelemetrySample[],
    maxDataPoints: number,
    channels: TelemetryChannelDescriptor[],
    config: DataFilterConfig
  ): TelemetryProcessingResult {
    const rawData = appendTelemetrySamples(current, incoming, maxDataPoints);
    const keys = resolveChannelKeys(rawData, channels);
    const filterActive = rawData.length > 0 && keys.length > 0 && isDataFilterReady(config);

    if (!filterActive) {
      this.reset();
      this.lastRaw = rawData;
      this.lastProcessed = rawData;
      return { rawData, processedData: rawData, filterActive: false };
    }

    const signature = JSON.stringify([keys, config]);
    const canAppend =
      this.processors !== null &&
      this.signature === signature &&
      this.lastRaw === current &&
      this.lastProcessed.length === current.length;

    let processed: TelemetrySample[];
    if (canAppend) {
      const added = runChannelProcessors(incoming, this.processors!);
      processed = this.lastProcessed.concat(added);
      if (processed.length > rawData.length) processed = processed.slice(-rawData.length);
    } else {
      // 配置变了 / 缓冲区被外部替换 / 首次运行：重建处理器并重放整个缓冲区
      this.processors = createChannelProcessors(keys, config);
      this.signature = signature;
      processed = runChannelProcessors(rawData, this.processors);
    }

    this.lastRaw = rawData;
    this.lastProcessed = processed;
    return { rawData, processedData: processed, filterActive: true };
  }
}
