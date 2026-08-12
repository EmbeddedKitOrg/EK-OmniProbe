import type { RttLine } from "./types";
import type { Encoding, RxFramingSettings, SerialLine } from "./serialTypes";
import { DEFAULT_RX_FRAMING } from "./serialTypes";
import { parseLogLevel } from "./utils";

export interface PendingTextData {
  rawData: number[];
}

export const TEXT_FRAME_IDLE_MS = 200;

/**
 * 残帧字节数上限。正常文本行远小于此值；只有在「数据里始终不出现分隔符」
 * （例如按 LF 分帧却收到连续二进制流）时才会触达。没有上限的话，残帧会一直
 * 增长，而每个新分片都要把它整个重扫一遍，退化成 O(n²) 并吃光内存。
 * 触达上限时把已有字节当作一行刷出，宁可多切一刀也不要卡死。
 */
const MAX_PENDING_BYTES = 1 << 20;

const emptyPendingTextData = (): PendingTextData => ({ rawData: [] });

const textDecoders: Record<Encoding, TextDecoder> = {
  "utf-8": new TextDecoder("utf-8"),
  ascii: new TextDecoder("ascii"),
  gbk: new TextDecoder("gbk"),
};

const decodeBytes = (bytes: number[], encoding: Encoding = "utf-8"): string =>
  textDecoders[encoding].decode(new Uint8Array(bytes));

function parseHexDelimiter(input: string): number[] {
  const hex = input.replace(/[^0-9a-fA-F]/g, "");
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) {
    bytes.push(parseInt(hex.slice(index, index + 2), 16));
  }
  return bytes;
}

/**
 * @param searchFrom 起始扫描位置。此位置之前的字节在上一分片里已经扫过且未命中分隔符，
 *   只有跨分片边界的那 delimiter.length-1 个字节需要重扫，其余无需重复扫描。
 *   注意只有扫描游标从这里开始，帧的起点仍然是 0。
 */
function splitBytesByDelimiter(
  bytes: number[],
  delimiter: number[],
  searchFrom = 0
): { frames: number[][]; rest: number[] } {
  const frames: number[][] = [];
  let start = 0;
  let index = Math.max(0, searchFrom);

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
  const previousLength = pendingBuffer.rawData.length;
  const fullRawData = previousLength === 0 ? data : pendingBuffer.rawData.concat(data);
  const resolved = resolveDelimiter(framing);

  // timeout 模式不按分隔符切分，交给空闲刷出；此处不解码，text 只在 flush 时才需要
  if (resolved === null) {
    return { lines: [], pending: { rawData: fullRawData } };
  }

  // 已扫描过的部分不必重扫，只需回退 delimiter.length-1 个字节覆盖跨分片的分隔符
  const searchFrom = previousLength - resolved.delimiter.length + 1;
  const { frames, rest } = splitBytesByDelimiter(fullRawData, resolved.delimiter, searchFrom);
  const lines: Omit<SerialLine, "id">[] = [];

  const pushFrame = (frameBytes: number[]) => {
    const text = decodeBytes(frameBytes, framing.encoding);
    if (!text.trim()) return;
    lines.push({
      timestamp: new Date(timestamp),
      text,
      level: parseLogLevel(text),
      rawData: frameBytes,
      direction,
    });
  };

  for (let frameBytes of frames) {
    if (resolved.stripTrailingCr && frameBytes[frameBytes.length - 1] === 0x0d) {
      frameBytes = frameBytes.slice(0, -1);
    }
    if (frameBytes.length === 0) continue;
    pushFrame(frameBytes);
  }

  // 残帧超限：当作一行刷出，避免无上限增长与反复重扫
  if (rest.length > MAX_PENDING_BYTES) {
    pushFrame(rest);
    return { lines, pending: emptyPendingTextData() };
  }

  return { lines, pending: { rawData: rest } };
}

/** 持有单路文本字节流的残帧，并统一提供接收、空闲刷出和会话重置。 */
export class TextFrameStream {
  private pending = emptyPendingTextData();
  private direction: "rx" | "tx" = "rx";
  private encoding: Encoding = "utf-8";

  ingest(
    data: number[],
    timestamp: number,
    direction: "rx" | "tx",
    framing: RxFramingSettings = DEFAULT_RX_FRAMING
  ): Omit<SerialLine, "id">[] {
    const encoding = framing.encoding ?? "utf-8";
    if (encoding !== this.encoding) this.pending = emptyPendingTextData();
    this.encoding = encoding;
    const result = parseSerialData(data, timestamp, direction, this.pending, framing);
    this.pending = result.pending;
    this.direction = direction;
    return result.lines;
  }

  flush(timestamp = Date.now()): Omit<SerialLine, "id">[] {
    // 与原实现一致：只要还有残留字节就刷出，即便解码结果全是空白也不过滤
    // （过滤是分帧时的行为，flush 面对的是「已经确定不会再有更多数据」的收尾）
    if (this.pending.rawData.length === 0) return [];

    const pending = this.pending;
    this.pending = emptyPendingTextData();
    const text = decodeBytes(pending.rawData, this.encoding);

    return [
      {
        timestamp: new Date(timestamp),
        text,
        level: parseLogLevel(text),
        rawData: pending.rawData,
        direction: this.direction,
      },
    ];
  }

  reset(): void {
    this.pending = emptyPendingTextData();
    this.direction = "rx";
    this.encoding = "utf-8";
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
    pendingBuffers.get(channel) ?? emptyPendingTextData()
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
