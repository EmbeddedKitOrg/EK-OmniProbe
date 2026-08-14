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

const SLCAN_MARKERS = new Set(["t", "T", "r", "R", "d", "D", "b", "B"]);
const CAN_FD_LENGTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64] as const;
const SLCAN_BITRATE_COMMANDS = new Map([
  [10_000, "S0"],
  [20_000, "S1"],
  [50_000, "S2"],
  [100_000, "S3"],
  [125_000, "S4"],
  [250_000, "S5"],
  [500_000, "S6"],
  [800_000, "S7"],
  [1_000_000, "S8"],
]);

export interface SlcanTransmitFrame {
  id: number;
  extended: boolean;
  rtr?: boolean;
  dlc?: number;
  fd?: boolean;
  brs?: boolean;
  data: number[];
}

/** 经典 CAN 帧位数估算：基础位数 + payload，再预留 20% 位填充。 */
export function estimateClassicCanBits(frame: Pick<CanFrameSample, "extended" | "rtr" | "dlc">): number {
  const baseBits = frame.extended ? 67 : 47;
  const payloadBits = frame.rtr ? 0 : frame.dlc * 8;
  return Math.floor((baseBits + payloadBits) * 1.2);
}

/** CAN FD 位数近似：仲裁段与数据段分开，供 BRS 双波特率负载估算。 */
export function estimateCanFdBits(frame: Pick<CanFrameSample, "extended" | "data">): {
  arbitrationBits: number;
  dataBits: number;
} {
  const arbitrationBits = Math.floor((frame.extended ? 48 : 28) * 1.2);
  const crcBits = frame.data.length <= 16 ? 17 : 21;
  const dataBits = Math.floor((20 + frame.data.length * 8 + crcBits) * 1.2);
  return { arbitrationBits, dataBits };
}

export function buildSlcanInitCommands(
  config: Pick<CanBusConfig, "bitrate" | "timestamps" | "initCommands">
): string[] {
  const custom = config.initCommands
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\r+$/, ""))
    .filter(Boolean);
  if (custom.length > 0) return custom;
  const bitrate = SLCAN_BITRATE_COMMANDS.get(config.bitrate);
  if (!bitrate) throw new Error("该波特率没有标准 SLCAN S0-S8 命令，请填写自定义初始化命令");
  return ["C", bitrate, config.timestamps ? "Z1" : "Z0", "O"];
}

export function buildSlcanFrameCommand(frame: SlcanTransmitFrame): string {
  if (!Number.isInteger(frame.id) || frame.id < 0 || frame.id > (frame.extended ? 0x1fffffff : 0x7ff)) {
    throw new Error(frame.extended ? "扩展帧 ID 必须在 0x0-0x1FFFFFFF" : "标准帧 ID 必须在 0x0-0x7FF");
  }
  if (frame.rtr && frame.fd) throw new Error("CAN FD 不支持远程帧");
  if (frame.brs && !frame.fd) throw new Error("BRS 只能用于 CAN FD");
  if (frame.data.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)) {
    throw new Error("CAN 数据必须是 0x00-0xFF 字节");
  }

  const length = frame.data.length;
  let dlc: number;
  if (frame.fd) {
    dlc = CAN_FD_LENGTHS.indexOf(length as (typeof CAN_FD_LENGTHS)[number]);
    if (dlc < 0) throw new Error("CAN FD 数据长度必须为 0-8、12、16、20、24、32、48 或 64 字节");
  } else {
    if (length > 8) throw new Error("经典 CAN 最多发送 8 字节");
    dlc = frame.rtr ? (frame.dlc ?? 0) : length;
    if (!Number.isInteger(dlc) || dlc < 0 || dlc > 8) throw new Error("RTR DLC 必须在 0-8");
  }

  const marker = frame.fd
    ? frame.brs
      ? frame.extended
        ? "B"
        : "b"
      : frame.extended
        ? "D"
        : "d"
    : frame.rtr
      ? frame.extended
        ? "R"
        : "r"
      : frame.extended
        ? "T"
        : "t";
  const id = frame.id
    .toString(16)
    .toUpperCase()
    .padStart(frame.extended ? 8 : 3, "0");
  const data = frame.rtr ? "" : frame.data.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join("");
  return `${marker}${id}${dlc.toString(16).toUpperCase()}${data}`;
}

/** 解析一条 Lawicel SLCAN 帧；非帧响应和格式错误都返回 null。 */
export function parseSlcanLine(line: string): ParsedSlcanLine | null {
  const text = line.trim();
  const marker = text[0];
  if (!SLCAN_MARKERS.has(marker)) return null;

  const extended = marker === marker.toUpperCase();
  const rtr = marker === "r" || marker === "R";
  const fd = marker === "d" || marker === "D" || marker === "b" || marker === "B";
  const brs = marker === "b" || marker === "B";
  const idWidth = extended ? 8 : 3;
  const headerLength = 1 + idWidth + 1;
  if (text.length < headerLength) return null;

  const idText = text.slice(1, 1 + idWidth);
  const dlcText = text.slice(1 + idWidth, headerLength);
  if (!/^[0-9a-f]+$/i.test(idText) || !(fd ? /^[0-9a-f]$/i : /^[0-8]$/i).test(dlcText)) return null;

  const id = Number.parseInt(idText, 16);
  const dlc = Number.parseInt(dlcText, 16);
  if (id > (extended ? 0x1fffffff : 0x7ff)) return null;

  const dataLength = fd ? CAN_FD_LENGTHS[dlc] : dlc;
  const dataHexLength = rtr ? 0 : dataLength * 2;
  const rest = text.slice(headerLength);
  if (rest.length !== dataHexLength && rest.length !== dataHexLength + 4) return null;

  const dataHex = rest.slice(0, dataHexLength);
  if (dataHex && !/^[0-9a-f]+$/i.test(dataHex)) return null;
  const timestampText = rest.slice(dataHexLength);
  if (timestampText && !/^[0-9a-f]{4}$/i.test(timestampText)) return null;

  const data = rtr
    ? []
    : Array.from({ length: dataLength }, (_, index) => Number.parseInt(dataHex.slice(index * 2, index * 2 + 2), 16));
  const frame = {
    id,
    extended,
    rtr,
    fd,
    brs,
    dlc,
    data,
    estimatedBits: 0,
    ...(timestampText ? { deviceTimestamp: Number.parseInt(timestampText, 16) } : {}),
  };
  frame.estimatedBits = fd
    ? Object.values(estimateCanFdBits(frame)).reduce((sum, bits) => sum + bits, 0)
    : estimateClassicCanBits(frame);
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
    if (
      !source ||
      source.frameId !== frame.id ||
      source.extended !== frame.extended ||
      (source.fd !== undefined && source.fd !== frame.fd) ||
      frame.rtr
    )
      continue;
    const value = decodeCanSignal(frame.data, source);
    if (value !== undefined && Number.isFinite(value)) values[channel.key] = value;
  }
  const { timestamp, deviceTimestamp: _deviceTimestamp, ...canFrame } = frame;
  return { timestamp, values, canFrame };
}

export function calculateCanLoad(
  samples: TelemetrySample[],
  config: Pick<CanBusConfig, "bitrate" | "dataBitrate" | "loadWindowMs">,
  now = Date.now()
): CanLoadSnapshot {
  const cutoff = now - config.loadWindowMs;
  const byId = new Map<string, CanIdLoadStats>();
  let frameCount = 0;
  let totalBits = 0;
  let totalBytes = 0;
  let totalDurationMs = 0;

  for (const sample of samples) {
    const frame = sample.canFrame;
    if (!frame || sample.timestamp < cutoff || sample.timestamp > now + 1_000) continue;
    frameCount += 1;
    totalBits += frame.estimatedBits;
    totalBytes += frame.data.length;
    if (frame.fd) {
      const { arbitrationBits, dataBits } = estimateCanFdBits(frame);
      totalDurationMs +=
        (arbitrationBits / config.bitrate + dataBits / (frame.brs ? config.dataBitrate : config.bitrate)) * 1_000;
    } else {
      totalDurationMs += (frame.estimatedBits / config.bitrate) * 1_000;
    }
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
    loadRatio:
      config.bitrate > 0 && config.dataBitrate > 0 && config.loadWindowMs > 0
        ? totalDurationMs / config.loadWindowMs
        : 0,
    perId: [...byId.values()].sort((left, right) => right.totalBits - left.totalBits),
  };
}
