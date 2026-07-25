import { TelemetryIngestionBuffer } from "./chartIngestion";
import type { Channel, TelemetryConfig } from "./chartTypes";
import { PRESET_COLORS } from "./chartTypes";
import { TextFrameStream } from "./dataFraming";
import { parseJustFloatChunk } from "./parseJustFloat";
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

function createJustFloatChannels(count: number): Channel[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `ch${index + 1}`,
    sourceIndex: index,
    name: `通道 ${index + 1}`,
    color: PRESET_COLORS[index % PRESET_COLORS.length],
    visible: true,
    role: "y",
  }));
}

function toJustFloatPoint(values: number[], config: TelemetryConfig, timestamp: number) {
  const mappedValues: Record<string, number> = {};
  config.channels.forEach((channel, index) => {
    const sourceIndex = channel.sourceIndex ?? index;
    if (sourceIndex >= 0 && sourceIndex < values.length) {
      mappedValues[channel.key] = values[sourceIndex];
    }
  });
  return { timestamp, values: mappedValues };
}

export class SerialReceivePipeline {
  private textFrames = new TextFrameStream();
  private terminalDecoder = new TextDecoder();
  private justFloatPending: number[] = [];

  ingest(event: SerialDataEvent, config: SerialReceivePipelineConfig): SerialReceiveResult {
    const lines: Omit<SerialLine, "id">[] = [];
    const telemetryBuffer = new TelemetryIngestionBuffer();
    let terminalText = "";
    let bytesReceived = 0;
    let detectedChannels: Channel[] | undefined;
    let chartConfig = config.chartConfig;

    for (const { data, timestamp } of event.chunks) {
      terminalText += this.terminalDecoder.decode(new Uint8Array(data), { stream: true });
      bytesReceived += data.length;

      if (chartConfig.enabled && chartConfig.parseMode === "justfloat" && event.direction === "rx") {
        const parsed = parseJustFloatChunk(data, this.justFloatPending);
        this.justFloatPending = parsed.pending;
        let fail = parsed.invalidFrames;

        if (parsed.frames.length > 0 && chartConfig.channels.length === 0) {
          detectedChannels = createJustFloatChannels(parsed.frames[0].length);
          chartConfig = { ...chartConfig, channels: detectedChannels };
        }

        const points = parsed.frames.flatMap((frame) => {
          const point = toJustFloatPoint(frame, chartConfig, timestamp);
          if (Object.keys(point.values).length > 0) return [point];
          fail += 1;
          return [];
        });
        telemetryBuffer.ingestBatch({ points, success: points.length, fail });
      } else {
        this.justFloatPending = [];
      }

      const framedLines = this.textFrames.ingest(data, timestamp, event.direction, config.framing);
      lines.push(...framedLines);

      if (framedLines.length > 0 && chartConfig.enabled && chartConfig.parseMode !== "justfloat") {
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
    if (config.chartConfig.enabled && config.chartConfig.parseMode !== "justfloat") {
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
    this.justFloatPending = [];
  }
}
