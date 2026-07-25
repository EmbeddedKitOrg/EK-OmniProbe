import type { RttLine } from "./types";
import type { RxFramingSettings, SerialLine } from "./serialTypes";
import { DEFAULT_RX_FRAMING } from "./serialTypes";
import { parseLogLevel } from "./utils";

export interface PendingTextData {
  text: string;
  rawData: number[];
}

export const TEXT_FRAME_IDLE_MS = 200;

const emptyPendingTextData = (): PendingTextData => ({ text: "", rawData: [] });

function parseHexDelimiter(input: string): number[] {
  const hex = input.replace(/[^0-9a-fA-F]/g, "");
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) {
    bytes.push(parseInt(hex.slice(index, index + 2), 16));
  }
  return bytes;
}

function splitBytesByDelimiter(bytes: number[], delimiter: number[]): { frames: number[][]; rest: number[] } {
  const frames: number[][] = [];
  let start = 0;
  let index = 0;

  while (index + delimiter.length <= bytes.length) {
    const matched = delimiter.every((value, offset) => bytes[index + offset] === value);
    if (matched) {
      frames.push(bytes.slice(start, index));
      index += delimiter.length;
      start = index;
    } else {
      index += 1;
    }
  }

  return { frames, rest: bytes.slice(start) };
}

function resolveDelimiter(framing: RxFramingSettings): { delimiter: number[]; stripTrailingCr: boolean } | null {
  switch (framing.mode) {
    case "lf":
      return { delimiter: [0x0a], stripTrailingCr: false };
    case "crlf":
      return { delimiter: [0x0d, 0x0a], stripTrailingCr: false };
    case "cr":
      return { delimiter: [0x0d], stripTrailingCr: false };
    case "custom": {
      const delimiter = framing.customIsHex
        ? parseHexDelimiter(framing.customDelimiter)
        : Array.from(new TextEncoder().encode(framing.customDelimiter ?? ""));
      return delimiter.length > 0 ? { delimiter, stripTrailingCr: false } : null;
    }
    case "timeout":
      return null;
    case "auto":
    default:
      return { delimiter: [0x0a], stripTrailingCr: true };
  }
}

/** 把任意字节来源切成串口形态的文本行；调用方持有未完成帧状态。 */
export function parseSerialData(
  data: number[],
  timestamp: number,
  direction: "rx" | "tx",
  pendingBuffer: PendingTextData,
  framing: RxFramingSettings = DEFAULT_RX_FRAMING
): { lines: Omit<SerialLine, "id">[]; pending: PendingTextData } {
  const fullRawData = pendingBuffer.rawData.concat(data);
  const resolved = resolveDelimiter(framing);
  const decoder = new TextDecoder();

  if (resolved === null) {
    return {
      lines: [],
      pending: { text: decoder.decode(new Uint8Array(fullRawData)), rawData: fullRawData },
    };
  }

  const { frames, rest } = splitBytesByDelimiter(fullRawData, resolved.delimiter);
  const lines: Omit<SerialLine, "id">[] = [];

  for (let frameBytes of frames) {
    if (resolved.stripTrailingCr && frameBytes[frameBytes.length - 1] === 0x0d) {
      frameBytes = frameBytes.slice(0, -1);
    }
    if (frameBytes.length === 0) continue;

    const text = decoder.decode(new Uint8Array(frameBytes));
    if (!text.trim()) continue;

    lines.push({
      timestamp: new Date(timestamp),
      text,
      level: parseLogLevel(text),
      rawData: frameBytes,
      direction,
    });
  }

  return {
    lines,
    pending: { text: decoder.decode(new Uint8Array(rest)), rawData: rest },
  };
}

/** 持有单路文本字节流的残帧，并统一提供接收、空闲刷出和会话重置。 */
export class TextFrameStream {
  private pending = emptyPendingTextData();
  private direction: "rx" | "tx" = "rx";

  ingest(
    data: number[],
    timestamp: number,
    direction: "rx" | "tx",
    framing: RxFramingSettings = DEFAULT_RX_FRAMING
  ): Omit<SerialLine, "id">[] {
    const result = parseSerialData(data, timestamp, direction, this.pending, framing);
    this.pending = result.pending;
    this.direction = direction;
    return result.lines;
  }

  flush(timestamp = Date.now()): Omit<SerialLine, "id">[] {
    if (this.pending.rawData.length === 0 && this.pending.text.length === 0) return [];

    const pending = this.pending;
    this.pending = emptyPendingTextData();
    return [
      {
        timestamp: new Date(timestamp),
        text: pending.text,
        level: parseLogLevel(pending.text),
        rawData: pending.rawData,
        direction: this.direction,
      },
    ];
  }

  reset(): void {
    this.pending = emptyPendingTextData();
    this.direction = "rx";
  }
}

/** RTT 仅增加通道维度，分帧行为与其他文本数据源保持一致。 */
export function parseRttData(
  data: number[],
  channel: number,
  timestamp: number,
  pendingBuffers: Map<number, PendingTextData>
): Omit<RttLine, "id">[] {
  const { lines, pending } = parseSerialData(
    data,
    timestamp,
    "rx",
    pendingBuffers.get(channel) ?? { text: "", rawData: [] }
  );
  pendingBuffers.set(channel, pending);

  return lines.map((line) => ({
    channel,
    timestamp: line.timestamp,
    text: line.text,
    level: line.level,
    rawData: line.rawData,
  }));
}
