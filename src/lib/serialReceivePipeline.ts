import { ChartIngestionBuffer } from "./chartIngestion";
import type { ChartConfig, Channel } from "./chartTypes";
import { PRESET_COLORS } from "./chartTypes";
import { parseSerialData, type PendingTextData } from "./dataFraming";
import { parseJustFloatChunk } from "./parseJustFloat";
import type { ChartParseBatch } from "./parseChartData";
import type { RxFramingSettings, SerialDataEvent, SerialLine } from "./serialTypes";
import { parseLogLevel } from "./utils";

export interface SerialReceivePipelineConfig {
  framing: RxFramingSettings;
  chartConfig: ChartConfig;
}

export interface SerialReceiveResult {
  terminalText: string;
  lines: Omit<SerialLine, "id">[];
  chartBatch: ChartParseBatch;
  bytesReceived: number;
  detectedChannels?: Channel[];
}

export function mergeSerialReceiveResults(results: SerialReceiveResult[]): SerialReceiveResult {
  const lines: Omit<SerialLine, "id">[] = [];
  const chartBuffer = new ChartIngestionBuffer();
  let terminalText = "";
  let bytesReceived = 0;
  let detectedChannels: Channel[] | undefined;

  for (const result of results) {
    terminalText += result.terminalText;
    lines.push(...result.lines);
    chartBuffer.ingestBatch(result.chartBatch);
    bytesReceived += result.bytesReceived;
    detectedChannels ??= result.detectedChannels;
  }

  return { terminalText, lines, chartBatch: chartBuffer.drain(), bytesReceived, detectedChannels };
}

const emptyPending = (): PendingTextData => ({ text: "", rawData: [] });

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

function toJustFloatPoint(values: number[], config: ChartConfig, timestamp: number) {
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
  private pending = emptyPending();
  private pendingDirection: "rx" | "tx" = "rx";
  private terminalDecoder = new TextDecoder();
  private justFloatPending: number[] = [];

  ingest(event: SerialDataEvent, config: SerialReceivePipelineConfig): SerialReceiveResult {
    const lines: Omit<SerialLine, "id">[] = [];
    const chartBuffer = new ChartIngestionBuffer();
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
        chartBuffer.ingestBatch({ points, success: points.length, fail });
      } else {
        this.justFloatPending = [];
      }

      const framed = parseSerialData(data, timestamp, event.direction, this.pending, config.framing);
      this.pending = framed.pending;
      this.pendingDirection = event.direction;
      lines.push(...framed.lines);

      if (framed.lines.length > 0 && chartConfig.enabled && chartConfig.parseMode !== "justfloat") {
        chartBuffer.ingestLines(framed.lines, chartConfig);
      }
    }

    return {
      terminalText,
      lines,
      chartBatch: chartBuffer.drain(),
      bytesReceived,
      detectedChannels,
    };
  }

  flushPending(config: SerialReceivePipelineConfig, timestamp = Date.now()): SerialReceiveResult {
    const pending = this.pending;
    if (pending.rawData.length === 0 && pending.text.length === 0) {
      return { terminalText: "", lines: [], chartBatch: { points: [], success: 0, fail: 0 }, bytesReceived: 0 };
    }

    const line: Omit<SerialLine, "id"> = {
      timestamp: new Date(timestamp),
      text: pending.text,
      level: parseLogLevel(pending.text),
      rawData: pending.rawData,
      direction: this.pendingDirection,
    };
    this.pending = emptyPending();

    const chartBuffer = new ChartIngestionBuffer();
    if (config.chartConfig.enabled && config.chartConfig.parseMode !== "justfloat") {
      chartBuffer.ingestLines([line], config.chartConfig);
    }

    return {
      terminalText: "",
      lines: [line],
      chartBatch: chartBuffer.drain(),
      bytesReceived: 0,
    };
  }

  reset(): void {
    this.pending = emptyPending();
    this.pendingDirection = "rx";
    this.terminalDecoder = new TextDecoder();
    this.justFloatPending = [];
  }
}
