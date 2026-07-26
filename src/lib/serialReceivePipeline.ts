import { TelemetryIngestionBuffer } from "./chartIngestion";
import type { Channel, ParseMode, TelemetryConfig } from "./chartTypes";
import { TextFrameStream } from "./dataFraming";
import { getChartParser, type BytesParserStream } from "./parseChartData";
import type { TelemetryBatch } from "./telemetry";
import type { RxFramingSettings, SerialDataEvent, SerialLine } from "./serialTypes";

export interface SerialReceivePipelineConfig {
  framing: RxFramingSettings;
  chartConfig: TelemetryConfig;
}

export interface SerialReceiveResult {
  terminalText: string;
  lines: Omit<SerialLine, "id">[];
  telemetryBatch: TelemetryBatch;
  bytesReceived: number;
  detectedChannels?: Channel[];
}

export function mergeSerialReceiveResults(results: SerialReceiveResult[]): SerialReceiveResult {
  const lines: Omit<SerialLine, "id">[] = [];
  const telemetryBuffer = new TelemetryIngestionBuffer();
  let terminalText = "";
  let bytesReceived = 0;
  let detectedChannels: Channel[] | undefined;

  for (const result of results) {
    terminalText += result.terminalText;
    lines.push(...result.lines);
    telemetryBuffer.ingestBatch(result.telemetryBatch);
    bytesReceived += result.bytesReceived;
    detectedChannels ??= result.detectedChannels;
  }

  return { terminalText, lines, telemetryBatch: telemetryBuffer.drain(), bytesReceived, detectedChannels };
}

export class SerialReceivePipeline {
  private textFrames = new TextFrameStream();
  private terminalDecoder = new TextDecoder();
  /** 当前 parseMode 对应的字节流解析实例；换解析器时重建。 */
  private bytesStream: BytesParserStream | null = null;
  private bytesStreamMode: ParseMode | null = null;

  /** 取当前配置对应的字节流解析器实例；不是字节流模式时返回 null。 */
  private resolveBytesStream(parseMode: ParseMode): BytesParserStream | null {
    const parser = getChartParser(parseMode);
    if (parser?.kind !== "bytes") {
      this.bytesStream = null;
      this.bytesStreamMode = null;
      return null;
    }
    if (this.bytesStreamMode !== parseMode || !this.bytesStream) {
      this.bytesStream = parser.createStream();
      this.bytesStreamMode = parseMode;
    }
    return this.bytesStream;
  }

  ingest(event: SerialDataEvent, config: SerialReceivePipelineConfig): SerialReceiveResult {
    const lines: Omit<SerialLine, "id">[] = [];
    const telemetryBuffer = new TelemetryIngestionBuffer();
    let terminalText = "";
    let bytesReceived = 0;
    let detectedChannels: Channel[] | undefined;
    let chartConfig = config.chartConfig;

    const bytesStream = chartConfig.enabled ? this.resolveBytesStream(chartConfig.parseMode) : null;

    for (const { data, timestamp } of event.chunks) {
      terminalText += this.terminalDecoder.decode(new Uint8Array(data), { stream: true });
      bytesReceived += data.length;

      // 字节流解析只对接收方向有意义：发出去的内容不是设备上报的遥测
      if (bytesStream && event.direction === "rx") {
        const parsed = bytesStream.ingest(data, chartConfig, timestamp);
        if (parsed.detectedChannels) {
          detectedChannels = parsed.detectedChannels;
          chartConfig = { ...chartConfig, channels: parsed.detectedChannels };
        }
        telemetryBuffer.ingestBatch({ points: parsed.points, success: parsed.success, fail: parsed.fail });
      }

      const framedLines = this.textFrames.ingest(data, timestamp, event.direction, config.framing);
      lines.push(...framedLines);

      // 字节流模式下文本行只用于终端显示，不再走一遍文本解析
      if (framedLines.length > 0 && chartConfig.enabled && !bytesStream) {
        telemetryBuffer.ingestLines(framedLines, chartConfig);
      }
    }

    return {
      terminalText,
      lines,
      telemetryBatch: telemetryBuffer.drain(),
      bytesReceived,
      detectedChannels,
    };
  }

  flushPending(config: SerialReceivePipelineConfig, timestamp = Date.now()): SerialReceiveResult {
    const lines = this.textFrames.flush(timestamp);
    if (lines.length === 0) {
      return { terminalText: "", lines: [], telemetryBatch: { points: [], success: 0, fail: 0 }, bytesReceived: 0 };
    }

    const telemetryBuffer = new TelemetryIngestionBuffer();
    // 字节流模式下残帧只是终端文本，不参与遥测解析
    const usesBytesParser = getChartParser(config.chartConfig.parseMode)?.kind === "bytes";
    if (config.chartConfig.enabled && !usesBytesParser) {
      telemetryBuffer.ingestLines(lines, config.chartConfig);
    }

    return {
      terminalText: "",
      lines,
      telemetryBatch: telemetryBuffer.drain(),
      bytesReceived: 0,
    };
  }

  reset(): void {
    this.textFrames.reset();
    this.terminalDecoder = new TextDecoder();
    this.bytesStream?.reset();
    this.bytesStream = null;
    this.bytesStreamMode = null;
  }
}
