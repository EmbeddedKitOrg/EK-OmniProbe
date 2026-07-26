import type { ChartDataPoint, ParseMode, TelemetryConfig } from "./chartTypes";
import { appendTelemetrySamples, type TelemetryBatch } from "./telemetry";
import {
  getChartParser,
  parseChartLines,
  type BytesParseResult,
  type BytesParserStream,
  type ChartInputLine,
} from "./parseChartData";

export function appendChartData(
  current: ChartDataPoint[],
  incoming: ChartDataPoint[],
  maxDataPoints: number
): ChartDataPoint[] {
  return appendTelemetrySamples(current, incoming, maxDataPoints);
}

export class TelemetryIngestionBuffer {
  private points: ChartDataPoint[] = [];
  private success = 0;
  private fail = 0;

  constructor(private readonly maxDataPoints = Number.POSITIVE_INFINITY) {}

  ingestLines(lines: ChartInputLine[], config: TelemetryConfig): void {
    this.ingestBatch(parseChartLines(lines, config));
  }

  ingestBatch(batch: TelemetryBatch): void {
    this.points.push(...batch.points);
    if (this.points.length > this.maxDataPoints) {
      this.points.splice(0, this.points.length - this.maxDataPoints);
    }
    this.success += batch.success;
    this.fail += batch.fail;
  }

  drain(): TelemetryBatch {
    const batch = { points: this.points, success: this.success, fail: this.fail };
    this.points = [];
    this.success = 0;
    this.fail = 0;
    return batch;
  }
}

export { TelemetryIngestionBuffer as ChartIngestionBuffer };

/**
 * 按解析模式在「字节流」和「文本行」两条路径间分派，并持有字节流解析器的跨分片状态。
 *
 * 三条采集来源（串口 / RTT / BLE）的分帧与生命周期差异很大——RTT 按通道分流并各自
 * 维护空闲定时器，串口还要额外产出终端文本和收发方向——把整条 hook 合并风险大于收益。
 * 这里只抽出真正共用的那一小块：解析器选择与字节流状态持有。
 *
 * 每条独立的数据流（串口一条、RTT 每通道一条、BLE 一条）各持有一个实例，不能共享，
 * 否则不同流的残包会互相污染。
 */
export class TelemetryParseDispatcher {
  private stream: BytesParserStream | null = null;
  private streamMode: ParseMode | null = null;

  /** 当前配置是否走字节流解析器。为 true 时文本行不应再参与遥测解析。 */
  usesBytesParser(config: TelemetryConfig): boolean {
    return config.enabled && getChartParser(config.parseMode)?.kind === "bytes";
  }

  /**
   * 喂入原始字节。非字节流模式返回 null，调用方据此走文本行路径。
   * 解析器实例在 parseMode 变化时自动重建。
   */
  ingestBytes(bytes: number[], config: TelemetryConfig, timestamp: number): BytesParseResult | null {
    if (!config.enabled) {
      this.clear();
      return null;
    }

    const parser = getChartParser(config.parseMode);
    if (parser?.kind !== "bytes") {
      this.clear();
      return null;
    }

    if (this.streamMode !== config.parseMode || !this.stream) {
      this.stream = parser.createStream();
      this.streamMode = config.parseMode;
    }

    return this.stream.ingest(bytes, config, timestamp);
  }

  reset(): void {
    this.stream?.reset();
    this.clear();
  }

  private clear(): void {
    this.stream = null;
    this.streamMode = null;
  }
}
