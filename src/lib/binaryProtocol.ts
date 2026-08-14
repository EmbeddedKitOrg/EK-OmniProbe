export const BINARY_FIELD_TYPES = [
  "uint8",
  "int8",
  "uint16",
  "int16",
  "uint24",
  "int24",
  "uint32",
  "int32",
  "uint64",
  "int64",
  "float32",
  "float64",
  "bcd8",
  "bcd16",
  "bcd32",
  "bitfield",
] as const;

export type BinaryFieldType = (typeof BINARY_FIELD_TYPES)[number];
export type BinaryByteOrder = "little" | "big";
export type BinaryFrameMode = "fixed" | "length" | "delimiter";
export type BinaryChecksumAlgorithm = "none" | "sum8" | "sum16" | "xor8" | "crc8" | "crc16" | "crc32";

export interface BinaryLengthFieldConfig {
  offset: number;
  width: 1 | 2 | 4;
  byteOrder: BinaryByteOrder;
  multiplier: number;
  adjustment: number;
}

export interface BinaryFrameConfig {
  header: number[];
  mode: BinaryFrameMode;
  fixedLength: number;
  delimiter: number[];
  lengthField: BinaryLengthFieldConfig;
  payloadOffset: number;
  maxLength: number;
}

export interface BinaryChecksumConfig {
  algorithm: BinaryChecksumAlgorithm;
  byteOrder: BinaryByteOrder;
  /** 校验值位置；负数表示从帧尾倒数，例如 -2。 */
  valueOffset: number;
  /** 参与校验的起始位置，包含。 */
  dataStart: number;
  /** 参与校验的结束位置，不包含；负数表示从帧尾倒数。 */
  dataEnd: number;
  polynomial: number;
  initial: number;
  xorOut: number;
  reflectIn: boolean;
  reflectOut: boolean;
}

export interface BinaryFieldConfig {
  key: string;
  name: string;
  unit?: string;
  type: BinaryFieldType;
  offsetBase: "frame" | "payload";
  offset: number;
  byteOrder: BinaryByteOrder;
  count: number;
  stride: number;
  scale: number;
  bias: number;
  bitOffset: number;
  bitLength: number;
}

export interface BinaryMessageConfig {
  id: string;
  name: string;
  /** 留空表示默认消息；否则按帧内字节匹配。 */
  matchOffset: number;
  matchBytes: number[];
  matchMask: number[];
  fields: BinaryFieldConfig[];
}

export interface BinaryProtocolConfig {
  version: 1;
  name: string;
  frame: BinaryFrameConfig;
  checksum: BinaryChecksumConfig;
  messages: BinaryMessageConfig[];
}

export interface BinaryChecksumPreset {
  id: string;
  label: string;
  config: Pick<
    BinaryChecksumConfig,
    "algorithm" | "byteOrder" | "polynomial" | "initial" | "xorOut" | "reflectIn" | "reflectOut"
  >;
}

export const BINARY_CHECKSUM_PRESETS: BinaryChecksumPreset[] = [
  {
    id: "none",
    label: "无校验",
    config: {
      algorithm: "none",
      byteOrder: "little",
      polynomial: 0,
      initial: 0,
      xorOut: 0,
      reflectIn: false,
      reflectOut: false,
    },
  },
  {
    id: "sum8",
    label: "SUM8",
    config: {
      algorithm: "sum8",
      byteOrder: "little",
      polynomial: 0,
      initial: 0,
      xorOut: 0,
      reflectIn: false,
      reflectOut: false,
    },
  },
  {
    id: "xor8",
    label: "XOR8",
    config: {
      algorithm: "xor8",
      byteOrder: "little",
      polynomial: 0,
      initial: 0,
      xorOut: 0,
      reflectIn: false,
      reflectOut: false,
    },
  },
  {
    id: "crc8",
    label: "CRC-8",
    config: {
      algorithm: "crc8",
      byteOrder: "little",
      polynomial: 0x07,
      initial: 0,
      xorOut: 0,
      reflectIn: false,
      reflectOut: false,
    },
  },
  {
    id: "crc8-maxim",
    label: "CRC-8/MAXIM-DOW",
    config: {
      algorithm: "crc8",
      byteOrder: "little",
      polynomial: 0x31,
      initial: 0,
      xorOut: 0,
      reflectIn: true,
      reflectOut: true,
    },
  },
  {
    id: "crc16-modbus",
    label: "CRC-16/MODBUS",
    config: {
      algorithm: "crc16",
      byteOrder: "little",
      polynomial: 0x8005,
      initial: 0xffff,
      xorOut: 0,
      reflectIn: true,
      reflectOut: true,
    },
  },
  {
    id: "crc16-ccitt-false",
    label: "CRC-16/CCITT-FALSE",
    config: {
      algorithm: "crc16",
      byteOrder: "big",
      polynomial: 0x1021,
      initial: 0xffff,
      xorOut: 0,
      reflectIn: false,
      reflectOut: false,
    },
  },
  {
    id: "crc16-xmodem",
    label: "CRC-16/XMODEM",
    config: {
      algorithm: "crc16",
      byteOrder: "big",
      polynomial: 0x1021,
      initial: 0,
      xorOut: 0,
      reflectIn: false,
      reflectOut: false,
    },
  },
  {
    id: "crc32",
    label: "CRC-32/ISO-HDLC",
    config: {
      algorithm: "crc32",
      byteOrder: "little",
      polynomial: 0x04c11db7,
      initial: 0xffffffff,
      xorOut: 0xffffffff,
      reflectIn: true,
      reflectOut: true,
    },
  },
];

export const DEFAULT_BINARY_PROTOCOL_CONFIG: BinaryProtocolConfig = {
  version: 1,
  name: "55 AA 长度帧",
  frame: {
    header: [0x55, 0xaa],
    mode: "length",
    fixedLength: 8,
    delimiter: [0x0d, 0x0a],
    lengthField: {
      offset: 3,
      width: 1,
      byteOrder: "little",
      multiplier: 1,
      adjustment: 6,
    },
    payloadOffset: 4,
    maxLength: 4096,
  },
  checksum: {
    algorithm: "crc16",
    byteOrder: "little",
    valueOffset: -2,
    dataStart: 0,
    dataEnd: -2,
    polynomial: 0x8005,
    initial: 0xffff,
    xorOut: 0,
    reflectIn: true,
    reflectOut: true,
  },
  messages: [
    {
      id: "default",
      name: "默认消息",
      matchOffset: 2,
      matchBytes: [],
      matchMask: [],
      fields: [
        {
          key: "value",
          name: "数值",
          type: "uint16",
          offsetBase: "payload",
          offset: 0,
          byteOrder: "little",
          count: 1,
          stride: 2,
          scale: 1,
          bias: 0,
          bitOffset: 0,
          bitLength: 8,
        },
      ],
    },
  ],
};

export interface BinaryDecodedField {
  key: string;
  name: string;
  unit?: string;
  value: number;
  offset: number;
  size: number;
}

export interface BinaryDecodeResult {
  success: boolean;
  messageId?: string;
  messageName?: string;
  values: Record<string, number>;
  fields: BinaryDecodedField[];
  error?: string;
  checksum?: { expected: number; actual: number };
}

export interface BinaryStreamResult {
  frames: BinaryDecodeResult[];
  invalidFrames: number;
  pendingBytes: number;
}

const FIELD_TYPE_SET = new Set<string>(BINARY_FIELD_TYPES);
const CHECKSUM_ALGORITHMS = new Set<string>(["none", "sum8", "sum16", "xor8", "crc8", "crc16", "crc32"]);
const MAX_FRAME_LENGTH = 1024 * 1024;

export function sanitizeBinaryProtocolConfig(raw: unknown): BinaryProtocolConfig {
  const source = asRecord(raw);
  const frameSource = asRecord(source.frame);
  const lengthSource = asRecord(frameSource.lengthField);
  const checksumSource = asRecord(source.checksum);
  const frameMode: BinaryFrameMode =
    frameSource.mode === "fixed" || frameSource.mode === "delimiter" ? frameSource.mode : "length";
  const algorithm = CHECKSUM_ALGORITHMS.has(String(checksumSource.algorithm))
    ? (checksumSource.algorithm as BinaryChecksumAlgorithm)
    : DEFAULT_BINARY_PROTOCOL_CONFIG.checksum.algorithm;

  const messages = Array.isArray(source.messages)
    ? source.messages.slice(0, 64).flatMap((entry, index) => sanitizeMessage(entry, index))
    : [];

  return {
    version: 1,
    name: text(source.name, DEFAULT_BINARY_PROTOCOL_CONFIG.name, 80),
    frame: {
      header: bytes(frameSource.header, DEFAULT_BINARY_PROTOCOL_CONFIG.frame.header, 32),
      mode: frameMode,
      fixedLength: integer(
        frameSource.fixedLength,
        1,
        MAX_FRAME_LENGTH,
        DEFAULT_BINARY_PROTOCOL_CONFIG.frame.fixedLength
      ),
      delimiter: bytes(frameSource.delimiter, DEFAULT_BINARY_PROTOCOL_CONFIG.frame.delimiter, 32),
      lengthField: {
        offset: integer(lengthSource.offset, 0, 4095, DEFAULT_BINARY_PROTOCOL_CONFIG.frame.lengthField.offset),
        width: lengthSource.width === 2 || lengthSource.width === 4 ? lengthSource.width : 1,
        byteOrder: lengthSource.byteOrder === "big" ? "big" : "little",
        multiplier: finite(lengthSource.multiplier, DEFAULT_BINARY_PROTOCOL_CONFIG.frame.lengthField.multiplier),
        adjustment: integer(
          lengthSource.adjustment,
          -MAX_FRAME_LENGTH,
          MAX_FRAME_LENGTH,
          DEFAULT_BINARY_PROTOCOL_CONFIG.frame.lengthField.adjustment
        ),
      },
      payloadOffset: integer(
        frameSource.payloadOffset,
        0,
        MAX_FRAME_LENGTH,
        DEFAULT_BINARY_PROTOCOL_CONFIG.frame.payloadOffset
      ),
      maxLength: integer(frameSource.maxLength, 1, MAX_FRAME_LENGTH, DEFAULT_BINARY_PROTOCOL_CONFIG.frame.maxLength),
    },
    checksum: {
      algorithm,
      byteOrder: checksumSource.byteOrder === "big" ? "big" : "little",
      valueOffset: integer(checksumSource.valueOffset, -MAX_FRAME_LENGTH, MAX_FRAME_LENGTH, -2),
      dataStart: integer(checksumSource.dataStart, -MAX_FRAME_LENGTH, MAX_FRAME_LENGTH, 0),
      dataEnd: integer(checksumSource.dataEnd, -MAX_FRAME_LENGTH, MAX_FRAME_LENGTH, -2),
      polynomial: unsigned32(checksumSource.polynomial, DEFAULT_BINARY_PROTOCOL_CONFIG.checksum.polynomial),
      initial: unsigned32(checksumSource.initial, DEFAULT_BINARY_PROTOCOL_CONFIG.checksum.initial),
      xorOut: unsigned32(checksumSource.xorOut, DEFAULT_BINARY_PROTOCOL_CONFIG.checksum.xorOut),
      reflectIn: checksumSource.reflectIn === true,
      reflectOut: checksumSource.reflectOut === true,
    },
    messages: messages.length > 0 ? messages : structuredClone(DEFAULT_BINARY_PROTOCOL_CONFIG.messages),
  };
}

function sanitizeMessage(raw: unknown, index: number): BinaryMessageConfig[] {
  const source = asRecord(raw);
  if (Object.keys(source).length === 0) return [];
  const fields = Array.isArray(source.fields)
    ? source.fields.slice(0, 256).flatMap((entry, fieldIndex) => sanitizeField(entry, fieldIndex))
    : [];
  const matchBytes = bytes(source.matchBytes, [], 16);
  const rawMask = bytes(source.matchMask, [], 16);
  return [
    {
      id: text(source.id, `message-${index + 1}`, 64),
      name: text(source.name, `消息 ${index + 1}`, 80),
      matchOffset: integer(source.matchOffset, 0, MAX_FRAME_LENGTH, 0),
      matchBytes,
      matchMask: matchBytes.map((_, byteIndex) => rawMask[byteIndex] ?? 0xff),
      fields,
    },
  ];
}

function sanitizeField(raw: unknown, index: number): BinaryFieldConfig[] {
  const source = asRecord(raw);
  if (Object.keys(source).length === 0) return [];
  const type = FIELD_TYPE_SET.has(String(source.type)) ? (source.type as BinaryFieldType) : "uint8";
  return [
    {
      key: text(source.key, `field${index + 1}`, 64),
      name: text(source.name, text(source.key, `字段 ${index + 1}`, 64), 80),
      unit: typeof source.unit === "string" ? source.unit.slice(0, 24) || undefined : undefined,
      type,
      offsetBase: source.offsetBase === "payload" ? "payload" : "frame",
      offset: integer(source.offset, 0, MAX_FRAME_LENGTH, 0),
      byteOrder: source.byteOrder === "big" ? "big" : "little",
      count: integer(source.count, 1, 1024, 1),
      stride: integer(source.stride, 0, MAX_FRAME_LENGTH, fieldByteWidth({ type, bitOffset: 0, bitLength: 8 })),
      scale: finite(source.scale, 1),
      bias: finite(source.bias, 0),
      bitOffset: integer(source.bitOffset, 0, 63, 0),
      bitLength: integer(source.bitLength, 1, 64, 8),
    },
  ];
}

export function validateBinaryProtocolConfig(config: BinaryProtocolConfig): string[] {
  const errors: string[] = [];
  const { frame, checksum } = config;
  if (frame.mode === "fixed" && frame.fixedLength > frame.maxLength) errors.push("固定帧长不能超过最大帧长");
  if (frame.mode === "length") {
    if (frame.lengthField.multiplier <= 0) errors.push("长度字段倍数必须大于 0");
    if (frame.lengthField.offset + frame.lengthField.width > frame.maxLength) errors.push("长度字段超出最大帧长");
  }
  if (frame.mode === "delimiter" && frame.delimiter.length === 0) errors.push("帧尾分隔符不能为空");
  if (frame.payloadOffset >= frame.maxLength) errors.push("Payload 起始位置必须小于最大帧长");
  if (config.messages.length === 0) errors.push("至少需要一条消息定义");
  if (config.messages.filter((message) => message.matchBytes.length === 0).length > 1)
    errors.push("只能有一条默认消息");

  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const message of config.messages) {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(message.id)) errors.push(`消息 ID 无效：${message.id}`);
    if (ids.has(message.id)) errors.push(`消息 ID 重复：${message.id}`);
    ids.add(message.id);
    if (message.matchBytes.length !== message.matchMask.length) errors.push(`${message.name} 的匹配值与掩码长度不一致`);
    if (message.matchOffset + message.matchBytes.length > frame.maxLength)
      errors.push(`${message.name} 的匹配位置超出最大帧长`);
    if (message.fields.length === 0) errors.push(`${message.name} 至少需要一个字段`);
    for (const field of message.fields) {
      if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(field.key)) errors.push(`字段 key 无效：${field.key}`);
      for (let index = 0; index < field.count; index += 1) {
        const key = expandedFieldKey(field, index);
        if (keys.has(key)) errors.push(`字段 key 重复：${key}`);
        keys.add(key);
      }
      const base = field.offsetBase === "payload" ? frame.payloadOffset : 0;
      const lastEnd = base + field.offset + (field.count - 1) * field.stride + fieldByteWidth(field);
      if (lastEnd > frame.maxLength) errors.push(`${field.name} 超出最大帧长`);
      if (frame.mode === "fixed" && lastEnd > frame.fixedLength) errors.push(`${field.name} 超出固定帧长`);
    }
  }

  if (checksum.algorithm !== "none") {
    const width = checksumByteWidth(checksum.algorithm);
    if (width === 0) errors.push("未知校验算法");
    if (checksum.dataStart === checksum.dataEnd) errors.push("CRC/校验和覆盖范围不能为空");
  }
  return Array.from(new Set(errors));
}

export function listBinaryProtocolFields(
  config: BinaryProtocolConfig
): Array<{ key: string; name: string; unit?: string }> {
  const result: Array<{ key: string; name: string; unit?: string }> = [];
  const seen = new Set<string>();
  for (const message of config.messages) {
    for (const field of message.fields) {
      for (let index = 0; index < field.count; index += 1) {
        const key = expandedFieldKey(field, index);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          key,
          name: field.count > 1 ? `${field.name} ${index + 1}` : field.name,
          unit: field.unit,
        });
      }
    }
  }
  return result;
}

export function decodeBinaryFrame(frame: number[], config: BinaryProtocolConfig): BinaryDecodeResult {
  const checksumResult = verifyChecksum(frame, config.checksum);
  if (!checksumResult.success) {
    return {
      success: false,
      values: {},
      fields: [],
      error: checksumResult.error,
      checksum: checksumResult.checksum,
    };
  }

  const message = selectMessage(frame, config.messages);
  if (!message) return { success: false, values: {}, fields: [], error: "没有消息定义匹配当前帧" };

  const values: Record<string, number> = {};
  const decodedFields: BinaryDecodedField[] = [];
  for (const field of message.fields) {
    const width = fieldByteWidth(field);
    const base = field.offsetBase === "payload" ? config.frame.payloadOffset : 0;
    for (let index = 0; index < field.count; index += 1) {
      const offset = base + field.offset + index * field.stride;
      const raw = decodeFieldValue(frame, offset, field);
      if (raw === undefined) {
        return {
          success: false,
          values: {},
          fields: decodedFields,
          error: `${field.name} 位于 [${offset}, ${offset + width})，超出帧范围或数值无法安全表示`,
          checksum: checksumResult.checksum,
        };
      }
      const value = raw * field.scale + field.bias;
      if (!Number.isFinite(value)) {
        return { success: false, values: {}, fields: decodedFields, error: `${field.name} 缩放后的数值无效` };
      }
      const key = expandedFieldKey(field, index);
      values[key] = value;
      decodedFields.push({
        key,
        name: field.count > 1 ? `${field.name} ${index + 1}` : field.name,
        unit: field.unit,
        value,
        offset,
        size: width,
      });
    }
  }

  return {
    success: true,
    messageId: message.id,
    messageName: message.name,
    values,
    fields: decodedFields,
    checksum: checksumResult.checksum,
  };
}

export class BinaryProtocolStream {
  private pending: number[] = [];
  private readonly config: BinaryProtocolConfig;

  constructor(config: BinaryProtocolConfig) {
    this.config = config;
  }

  ingest(bytesToAdd: number[]): BinaryStreamResult {
    this.pending.push(...bytesToAdd.map((value) => value & 0xff));
    const frames: BinaryDecodeResult[] = [];
    let invalidFrames = 0;
    const configErrors = validateBinaryProtocolConfig(this.config);
    if (configErrors.length > 0) {
      this.pending = [];
      return { frames, invalidFrames: bytesToAdd.length > 0 ? 1 : 0, pendingBytes: 0 };
    }

    while (this.pending.length > 0) {
      if (!this.alignHeader()) break;
      const frameLength = this.resolveFrameLength();
      if (frameLength === null) break;
      if (frameLength <= 0 || frameLength > this.config.frame.maxLength) {
        this.pending.shift();
        invalidFrames += 1;
        continue;
      }
      if (this.pending.length < frameLength) break;

      const frame = this.pending.slice(0, frameLength);
      const decoded = decodeBinaryFrame(frame, this.config);
      if (!decoded.success && decoded.checksum && this.config.frame.header.length > 0) {
        this.pending.shift();
        invalidFrames += 1;
        continue;
      }
      this.pending.splice(0, frameLength);
      if (decoded.success) frames.push(decoded);
      else invalidFrames += 1;
    }

    const cap = Math.max(this.config.frame.maxLength * 2, 1024);
    if (this.pending.length > cap) {
      this.pending = this.pending.slice(-this.config.frame.maxLength);
      invalidFrames += 1;
    }
    return { frames, invalidFrames, pendingBytes: this.pending.length };
  }

  reset(): void {
    this.pending = [];
  }

  private alignHeader(): boolean {
    const header = this.config.frame.header;
    if (header.length === 0) return true;
    const index = findSequence(this.pending, header, 0);
    if (index >= 0) {
      if (index > 0) this.pending.splice(0, index);
      return true;
    }
    const keep = Math.min(this.pending.length, header.length - 1);
    this.pending = keep > 0 ? this.pending.slice(-keep) : [];
    return false;
  }

  private resolveFrameLength(): number | null {
    const frame = this.config.frame;
    if (frame.mode === "fixed") return frame.fixedLength;
    if (frame.mode === "delimiter") {
      const index = findSequence(this.pending, frame.delimiter, frame.header.length);
      return index < 0 ? null : index + frame.delimiter.length;
    }
    const field = frame.lengthField;
    if (this.pending.length < field.offset + field.width) return null;
    const raw = readUnsignedNumber(this.pending, field.offset, field.width, field.byteOrder);
    if (raw === undefined) return -1;
    return Math.floor(raw * field.multiplier + field.adjustment);
  }
}

export function calculateChecksum(data: number[], config: BinaryChecksumConfig): number {
  if (config.algorithm === "none") return 0;
  if (config.algorithm === "sum8" || config.algorithm === "sum16") {
    const mask = config.algorithm === "sum8" ? 0xff : 0xffff;
    return data.reduce((sum, byte) => (sum + (byte & 0xff)) & mask, config.initial & mask) ^ (config.xorOut & mask);
  }
  if (config.algorithm === "xor8") {
    return data.reduce((value, byte) => value ^ (byte & 0xff), config.initial & 0xff) ^ (config.xorOut & 0xff);
  }

  const width = checksumByteWidth(config.algorithm) * 8;
  const mask = (1n << BigInt(width)) - 1n;
  const topBit = 1n << BigInt(width - 1);
  const polynomial = BigInt(config.polynomial >>> 0) & mask;
  let crc = BigInt(config.initial >>> 0) & mask;

  if (config.reflectIn) {
    const reflectedPolynomial = reflectBits(polynomial, width);
    for (const byte of data) {
      crc ^= BigInt(byte & 0xff);
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1n) !== 0n ? (crc >> 1n) ^ reflectedPolynomial : crc >> 1n;
    }
  } else {
    for (const byte of data) {
      crc ^= BigInt(byte & 0xff) << BigInt(width - 8);
      for (let bit = 0; bit < 8; bit += 1)
        crc = (crc & topBit) !== 0n ? ((crc << 1n) ^ polynomial) & mask : (crc << 1n) & mask;
    }
  }
  if (config.reflectOut !== config.reflectIn) crc = reflectBits(crc, width);
  return Number((crc ^ BigInt(config.xorOut >>> 0)) & mask);
}

export function parseHexBytes(input: string): number[] | null {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const withoutPrefixes = trimmed.replace(/0x/gi, "");
  if (/[^0-9a-fA-F\s,;:_-]/.test(withoutPrefixes)) return null;
  const hasSeparator = /[\s,;:_-]/.test(withoutPrefixes);
  const tokens = hasSeparator
    ? withoutPrefixes.split(/[\s,;:_-]+/).filter(Boolean)
    : (withoutPrefixes.match(/.{1,2}/g) ?? []);
  if (!hasSeparator && withoutPrefixes.length % 2 !== 0) return null;
  if (tokens.some((token) => token.length > 2 || !/^[0-9a-fA-F]+$/.test(token))) return null;
  return tokens.map((token) => Number.parseInt(token, 16));
}

export function formatHexBytes(bytesToFormat: number[]): string {
  return bytesToFormat.map((byte) => (byte & 0xff).toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

export function checksumByteWidth(algorithm: BinaryChecksumAlgorithm): number {
  if (algorithm === "sum8" || algorithm === "xor8" || algorithm === "crc8") return 1;
  if (algorithm === "sum16" || algorithm === "crc16") return 2;
  if (algorithm === "crc32") return 4;
  return 0;
}

export function fieldByteWidth(field: Pick<BinaryFieldConfig, "type" | "bitOffset" | "bitLength">): number {
  if (field.type === "uint8" || field.type === "int8" || field.type === "bcd8") return 1;
  if (field.type === "uint16" || field.type === "int16" || field.type === "bcd16") return 2;
  if (field.type === "uint24" || field.type === "int24") return 3;
  if (field.type === "uint32" || field.type === "int32" || field.type === "float32" || field.type === "bcd32") return 4;
  if (field.type === "uint64" || field.type === "int64" || field.type === "float64") return 8;
  return Math.ceil((field.bitOffset + field.bitLength) / 8);
}

function verifyChecksum(
  frame: number[],
  checksum: BinaryChecksumConfig
): { success: boolean; error?: string; checksum?: { expected: number; actual: number } } {
  if (checksum.algorithm === "none") return { success: true };
  const width = checksumByteWidth(checksum.algorithm);
  const valueOffset = resolveOffset(checksum.valueOffset, frame.length);
  const dataStart = resolveOffset(checksum.dataStart, frame.length);
  const dataEnd = resolveOffset(checksum.dataEnd, frame.length);
  if (
    valueOffset < 0 ||
    valueOffset + width > frame.length ||
    dataStart < 0 ||
    dataEnd > frame.length ||
    dataEnd <= dataStart
  ) {
    return { success: false, error: "校验值位置或覆盖范围超出当前帧" };
  }
  const expected = readUnsignedNumber(frame, valueOffset, width, checksum.byteOrder);
  if (expected === undefined) return { success: false, error: "无法读取校验值" };
  const actual = calculateChecksum(frame.slice(dataStart, dataEnd), checksum);
  return expected === actual
    ? { success: true, checksum: { expected, actual } }
    : {
        success: false,
        error: `校验失败：帧内 0x${expected.toString(16).toUpperCase()}，计算 0x${actual.toString(16).toUpperCase()}`,
        checksum: { expected, actual },
      };
}

function selectMessage(frame: number[], messages: BinaryMessageConfig[]): BinaryMessageConfig | undefined {
  const fallback = messages.find((message) => message.matchBytes.length === 0);
  return (
    messages.find((message) => {
      if (message.matchBytes.length === 0 || message.matchOffset + message.matchBytes.length > frame.length)
        return false;
      return message.matchBytes.every(
        (value, index) =>
          ((frame[message.matchOffset + index] ?? 0) & message.matchMask[index]) === (value & message.matchMask[index])
      );
    }) ?? fallback
  );
}

function decodeFieldValue(frame: number[], offset: number, field: BinaryFieldConfig): number | undefined {
  const width = fieldByteWidth(field);
  if (offset < 0 || offset + width > frame.length) return undefined;
  if (field.type === "float32" || field.type === "float64") {
    const view = new DataView(Uint8Array.from(frame.slice(offset, offset + width)).buffer);
    return field.type === "float32"
      ? view.getFloat32(0, field.byteOrder === "little")
      : view.getFloat64(0, field.byteOrder === "little");
  }
  if (field.type.startsWith("bcd")) return readBcd(frame, offset, width, field.byteOrder);

  let raw = readUnsignedBigInt(frame, offset, width, field.byteOrder);
  if (field.type === "bitfield") {
    raw = (raw >> BigInt(field.bitOffset)) & ((1n << BigInt(field.bitLength)) - 1n);
  } else if (field.type.startsWith("int")) {
    const bits = BigInt(width * 8);
    const sign = 1n << (bits - 1n);
    if ((raw & sign) !== 0n) raw -= 1n << bits;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function readBcd(frame: number[], offset: number, width: number, byteOrder: BinaryByteOrder): number | undefined {
  const ordered = frame.slice(offset, offset + width);
  if (byteOrder === "little") ordered.reverse();
  let value = 0;
  for (const byte of ordered) {
    const high = byte >> 4;
    const low = byte & 0x0f;
    if (high > 9 || low > 9) return undefined;
    value = value * 100 + high * 10 + low;
  }
  return value;
}

function readUnsignedNumber(
  data: number[],
  offset: number,
  width: number,
  byteOrder: BinaryByteOrder
): number | undefined {
  if (offset < 0 || offset + width > data.length) return undefined;
  const value = Number(readUnsignedBigInt(data, offset, width, byteOrder));
  return Number.isSafeInteger(value) ? value : undefined;
}

function readUnsignedBigInt(data: number[], offset: number, width: number, byteOrder: BinaryByteOrder): bigint {
  let value = 0n;
  if (byteOrder === "big") {
    for (let index = 0; index < width; index += 1) value = (value << 8n) | BigInt(data[offset + index] & 0xff);
  } else {
    for (let index = width - 1; index >= 0; index -= 1) value = (value << 8n) | BigInt(data[offset + index] & 0xff);
  }
  return value;
}

function expandedFieldKey(field: BinaryFieldConfig, index: number): string {
  return field.count > 1 ? `${field.key}_${index + 1}` : field.key;
}

function resolveOffset(offset: number, frameLength: number): number {
  return offset < 0 ? frameLength + offset : offset;
}

function findSequence(data: number[], sequence: number[], from: number): number {
  if (sequence.length === 0) return from;
  outer: for (let index = Math.max(0, from); index <= data.length - sequence.length; index += 1) {
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (data[index + offset] !== sequence[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

function reflectBits(value: bigint, width: number): bigint {
  let reflected = 0n;
  for (let bit = 0; bit < width; bit += 1) {
    reflected = (reflected << 1n) | ((value >> BigInt(bit)) & 1n);
  }
  return reflected;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function finite(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Math.floor(finite(value, fallback))));
}

function unsigned32(value: unknown, fallback: number): number {
  const parsed = finite(value, fallback);
  return Math.min(0xffffffff, Math.max(0, Math.floor(parsed))) >>> 0;
}

function bytes(value: unknown, fallback: number[], maxLength: number): number[] {
  if (!Array.isArray(value)) return fallback.slice();
  return value.slice(0, maxLength).map((item) => integer(item, 0, 255, 0));
}
