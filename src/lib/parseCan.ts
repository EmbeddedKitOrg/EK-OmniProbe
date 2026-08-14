import type { CanBusConfig, Channel } from "./chartTypes";
import type { CanFrameSample, TelemetrySample } from "./telemetry";

export interface SlcanFrame extends CanFrameSample {
  timestamp: number;
  deviceTimestamp?: number;
}

export interface SlcanChunkResult {
  frames: SlcanFrame[];
  invalidFrames: number;
}

export interface CanIdLoadStats {
  id: number;
  extended: boolean;
  frameCount: number;
  totalBits: number;
  totalBytes: number;
}

export interface CanLoadSnapshot {
  frameCount: number;
  totalBits: number;
  totalBytes: number;
  framesPerSecond: number;
  loadRatio: number;
  perId: CanIdLoadStats[];
}

type ParsedSlcanLine = Omit<SlcanFrame, "timestamp">;

const SLCAN_MARKERS = new Set(["t", "T", "r", "R"]);

/** 经典 CAN 帧位数估算：基础位数 + payload，再预留 20% 位填充。 */
export function estimateClassicCanBits(frame: Pick<CanFrameSample, "extended" | "rtr" | "dlc">): number {
  const baseBits = frame.extended ? 67 : 47;
  const payloadBits = frame.rtr ? 0 : frame.dlc * 8;
  return Math.floor((baseBits + payloadBits) * 1.2);
}

/** 解析一条 Lawicel SLCAN 帧；非帧响应和格式错误都返回 null。 */
export function parseSlcanLine(line: string): ParsedSlcanLine | null {
  const text = line.trim();
  const marker = text[0];
  if (!SLCAN_MARKERS.has(marker)) return null;

  const extended = marker === "T" || marker === "R";
  const rtr = marker === "r" || marker === "R";
  const idWidth = extended ? 8 : 3;
  const headerLength = 1 + idWidth + 1;
  if (text.length < headerLength) return null;

  const idText = text.slice(1, 1 + idWidth);
  const dlcText = text.slice(1 + idWidth, headerLength);
  if (!/^[0-9a-f]+$/i.test(idText) || !/^[0-8]$/i.test(dlcText)) return null;

  const id = Number.parseInt(idText, 16);
  const dlc = Number.parseInt(dlcText, 16);
  if (id > (extended ? 0x1fffffff : 0x7ff)) return null;

  const dataHexLength = rtr ? 0 : dlc * 2;
  const rest = text.slice(headerLength);
  if (rest.length !== dataHexLength && rest.length !== dataHexLength + 4) return null;

  const dataHex = rest.slice(0, dataHexLength);
  if (dataHex && !/^[0-9a-f]+$/i.test(dataHex)) return null;
  const timestampText = rest.slice(dataHexLength);
  if (timestampText && !/^[0-9a-f]{4}$/i.test(timestampText)) return null;

  const data = rtr
    ? []
    : Array.from({ length: dlc }, (_, index) => Number.parseInt(dataHex.slice(index * 2, index * 2 + 2), 16));
  const frame = {
    id,
    extended,
    rtr,
    dlc,
    data,
    estimatedBits: 0,
    ...(timestampText ? { deviceTimestamp: Number.parseInt(timestampText, 16) } : {}),
  };
  frame.estimatedBits = estimateClassicCanBits(frame);
  return frame;
}

/**
 * 跨串口分片解析 CR/LF 分隔的 SLCAN 帧，并把可选的 16 位设备时间戳展开到主机时间轴。
 */
export class SlcanStream {
  private decoder = new TextDecoder("ascii");
  private pending = "";
  private deviceBase: number | null = null;
  private hostBase = 0;
  private lastDeviceTimestamp: number | null = null;
  private deviceWrap = 0;

  ingest(bytes: number[], hostTimestamp: number): SlcanChunkResult {
    this.pending += this.decoder.decode(new Uint8Array(bytes), { stream: true });
    const frames: SlcanFrame[] = [];
    let invalidFrames = 0;
    let start = 0;

    for (let index = 0; index < this.pending.length; index += 1) {
      const char = this.pending[index];
      if (char !== "\r" && char !== "\n") continue;
      const line = this.pending.slice(start, index);
      start = index + 1;
      if (!line) continue;

      const parsed = parseSlcanLine(line);
      if (parsed) {
        frames.push({ ...parsed, timestamp: this.resolveTimestamp(parsed.deviceTimestamp, hostTimestamp) });
      } else if (SLCAN_MARKERS.has(line.trim()[0])) {
        invalidFrames += 1;
      }
    }

    this.pending = this.pending.slice(start);
    if (this.pending.length > 128) {
      this.pending = "";
      invalidFrames += 1;
    }

    return { frames, invalidFrames };
  }

  reset(): void {
    this.decoder = new TextDecoder("ascii");
    this.pending = "";
    this.deviceBase = null;
    this.hostBase = 0;
    this.lastDeviceTimestamp = null;
    this.deviceWrap = 0;
  }

  private resolveTimestamp(deviceTimestamp: number | undefined, hostTimestamp: number): number {
    if (deviceTimestamp === undefined) return hostTimestamp;
    if (
      this.lastDeviceTimestamp !== null &&
      deviceTimestamp < this.lastDeviceTimestamp &&
      this.lastDeviceTimestamp - deviceTimestamp > 0x8000
    ) {
      this.deviceWrap += 0x10000;
    }
    this.lastDeviceTimestamp = deviceTimestamp;
    const unwrapped = this.deviceWrap + deviceTimestamp;
    if (this.deviceBase === null) {
      this.deviceBase = unwrapped;
      this.hostBase = hostTimestamp;
    }
    return this.hostBase + unwrapped - this.deviceBase;
  }
}

/** 按 DBC 常用位编号提取信号：Intel 为 LSB0，Motorola 为 sawtooth/MSB。 */
export function decodeCanSignal(data: number[], source: NonNullable<Channel["can"]>): number | undefined {
  let raw = 0n;

  if (source.byteOrder === "little") {
    if (source.startBit + source.bitLength > data.length * 8) return undefined;
    for (let index = 0; index < source.bitLength; index += 1) {
      const bit = source.startBit + index;
      const value = (data[Math.floor(bit / 8)] >> (bit % 8)) & 1;
      raw |= BigInt(value) << BigInt(index);
    }
  } else {
    let bit = source.startBit;
    for (let index = 0; index < source.bitLength; index += 1) {
      if (bit < 0 || bit >= data.length * 8) return undefined;
      const value = (data[Math.floor(bit / 8)] >> (bit % 8)) & 1;
      raw = (raw << 1n) | BigInt(value);
      bit = bit % 8 === 0 ? bit + 15 : bit - 1;
    }
  }

  if (source.signed) {
    const sign = 1n << BigInt(source.bitLength - 1);
    if ((raw & sign) !== 0n) raw -= 1n << BigInt(source.bitLength);
  }
  return Number(raw) * source.factor + source.offset;
}

export function slcanFrameToTelemetry(frame: SlcanFrame, channels: Channel[]): TelemetrySample {
  const values: Record<string, number> = {};
  for (const channel of channels) {
    const source = channel.can;
    if (!source || source.frameId !== frame.id || source.extended !== frame.extended || frame.rtr) continue;
    const value = decodeCanSignal(frame.data, source);
    if (value !== undefined && Number.isFinite(value)) values[channel.key] = value;
  }
  const { timestamp, deviceTimestamp: _deviceTimestamp, ...canFrame } = frame;
  return { timestamp, values, canFrame };
}

export function calculateCanLoad(
  samples: TelemetrySample[],
  config: Pick<CanBusConfig, "bitrate" | "loadWindowMs">,
  now = Date.now()
): CanLoadSnapshot {
  const cutoff = now - config.loadWindowMs;
  const byId = new Map<string, CanIdLoadStats>();
  let frameCount = 0;
  let totalBits = 0;
  let totalBytes = 0;

  for (const sample of samples) {
    const frame = sample.canFrame;
    if (!frame || sample.timestamp < cutoff || sample.timestamp > now + 1_000) continue;
    frameCount += 1;
    totalBits += frame.estimatedBits;
    totalBytes += frame.data.length;
    const key = `${frame.extended ? "e" : "s"}:${frame.id}`;
    const stats = byId.get(key) ?? {
      id: frame.id,
      extended: frame.extended,
      frameCount: 0,
      totalBits: 0,
      totalBytes: 0,
    };
    stats.frameCount += 1;
    stats.totalBits += frame.estimatedBits;
    stats.totalBytes += frame.data.length;
    byId.set(key, stats);
  }

  const windowSeconds = config.loadWindowMs / 1_000;
  return {
    frameCount,
    totalBits,
    totalBytes,
    framesPerSecond: windowSeconds > 0 ? frameCount / windowSeconds : 0,
    loadRatio: config.bitrate > 0 && windowSeconds > 0 ? totalBits / (config.bitrate * windowSeconds) : 0,
    perId: [...byId.values()].sort((left, right) => right.totalBits - left.totalBits),
  };
}
