import {
  isModbusParseMode,
  PRESET_COLORS,
  type Channel,
  type ModbusDataType,
  type ModbusRtuConfig,
  type ParseMode,
} from "./chartTypes";
import type { DataSourceType } from "./serialTypes";

export interface ModbusRtuChunkResult {
  payloads: number[][];
  exceptions: number[];
  invalidFrames: number;
  pending: number[];
}

export function modbusCrc16(data: number[]): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte & 0xff;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

export function modbusLrc(data: number[]): number {
  return -data.reduce((sum, byte) => sum + (byte & 0xff), 0) & 0xff;
}

export function buildModbusReadRequest(config: ModbusRtuConfig): number[] {
  const frame = [
    config.slaveId,
    config.functionCode,
    config.startAddress >>> 8,
    config.startAddress & 0xff,
    config.registerCount >>> 8,
    config.registerCount & 0xff,
  ];
  const crc = modbusCrc16(frame);
  return [...frame, crc & 0xff, crc >>> 8];
}

export function buildModbusAsciiReadRequest(config: ModbusRtuConfig): number[] {
  const body = [
    config.slaveId,
    config.functionCode,
    config.startAddress >>> 8,
    config.startAddress & 0xff,
    config.registerCount >>> 8,
    config.registerCount & 0xff,
  ];
  const encoded = [...body, modbusLrc(body)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return Array.from(`:${encoded}\r\n`, (char) => char.charCodeAt(0));
}

export function buildModbusTcpReadRequest(config: ModbusRtuConfig, transactionId: number): number[] {
  return [
    (transactionId >>> 8) & 0xff,
    transactionId & 0xff,
    0,
    0,
    0,
    6,
    config.slaveId,
    config.functionCode,
    config.startAddress >>> 8,
    config.startAddress & 0xff,
    config.registerCount >>> 8,
    config.registerCount & 0xff,
  ];
}

export function isModbusSourceCompatible(parseMode: ParseMode, source: DataSourceType): boolean {
  if (!isModbusParseMode(parseMode) || source === "simulation") return false;
  return parseMode !== "modbus-tcp" || source === "tcp";
}

export function shouldAutoPollModbus(parseMode: ParseMode, config: ModbusRtuConfig, source: DataSourceType): boolean {
  return config.autoPoll && isModbusSourceCompatible(parseMode, source);
}

type ModbusFrameDisposition = "accepted" | "invalid" | "ignored";

function collectModbusResponse(
  body: number[],
  config: ModbusRtuConfig,
  payloads: number[][],
  exceptions: number[]
): ModbusFrameDisposition {
  if (body[0] !== config.slaveId || body.length < 2) return "ignored";
  const functionCode = body[1];
  if (functionCode === (config.functionCode | 0x80)) {
    if (body.length !== 3) return "invalid";
    exceptions.push(body[2]);
    return "accepted";
  }
  if (functionCode !== config.functionCode) return "ignored";

  const expectedByteCount = config.registerCount * 2;
  if (body.length !== expectedByteCount + 3 || body[2] !== expectedByteCount) return "invalid";
  payloads.push(body.slice(3));
  return "accepted";
}

export function parseModbusRtuChunk(
  data: number[],
  config: ModbusRtuConfig,
  pending: number[] = []
): ModbusRtuChunkResult {
  const bytes = pending.concat(data);
  const payloads: number[][] = [];
  const exceptions: number[] = [];
  let invalidFrames = 0;
  let cursor = 0;
  const expectedByteCount = config.registerCount * 2;

  while (cursor < bytes.length) {
    if (bytes[cursor] !== config.slaveId) {
      cursor += 1;
      continue;
    }
    if (bytes.length - cursor < 2) break;

    const functionCode = bytes[cursor + 1];
    const isException = functionCode === (config.functionCode | 0x80);
    if (functionCode !== config.functionCode && !isException) {
      cursor += 1;
      continue;
    }

    const frameLength = isException ? 5 : expectedByteCount + 5;
    if (bytes.length - cursor < frameLength) break;
    if (!isException && bytes[cursor + 2] !== expectedByteCount) {
      invalidFrames += 1;
      cursor += 1;
      continue;
    }

    const frame = bytes.slice(cursor, cursor + frameLength);
    const receivedCrc = frame[frameLength - 2] | (frame[frameLength - 1] << 8);
    if (modbusCrc16(frame.slice(0, -2)) !== receivedCrc) {
      invalidFrames += 1;
      cursor += 1;
      continue;
    }

    if (isException) exceptions.push(frame[2]);
    else payloads.push(frame.slice(3, -2));
    cursor += frameLength;
  }

  return { payloads, exceptions, invalidFrames, pending: bytes.slice(cursor) };
}

export function parseModbusAsciiChunk(
  data: number[],
  config: ModbusRtuConfig,
  pending: number[] = []
): ModbusRtuChunkResult {
  const bytes = pending.concat(data);
  const payloads: number[][] = [];
  const exceptions: number[] = [];
  let invalidFrames = 0;
  let cursor = 0;

  while (cursor < bytes.length) {
    const start = bytes.indexOf(0x3a, cursor);
    if (start < 0) return { payloads, exceptions, invalidFrames, pending: [] };
    let end = -1;
    for (let index = start + 1; index + 1 < bytes.length; index += 1) {
      if (bytes[index] === 0x0d && bytes[index + 1] === 0x0a) {
        end = index;
        break;
      }
    }
    if (end < 0) {
      if (bytes.length - start <= 513) {
        return { payloads, exceptions, invalidFrames, pending: bytes.slice(start) };
      }
      invalidFrames += 1;
      cursor = start + 1;
      continue;
    }

    const encoded = String.fromCharCode(...bytes.slice(start + 1, end));
    if (encoded.length < 8 || encoded.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(encoded)) {
      invalidFrames += 1;
      cursor = end + 2;
      continue;
    }
    const frame = Array.from({ length: encoded.length / 2 }, (_, index) =>
      Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16)
    );
    if (frame.reduce((sum, byte) => sum + byte, 0) % 256 !== 0) {
      invalidFrames += 1;
      cursor = end + 2;
      continue;
    }
    if (collectModbusResponse(frame.slice(0, -1), config, payloads, exceptions) === "invalid") {
      invalidFrames += 1;
    }
    cursor = end + 2;
  }

  return { payloads, exceptions, invalidFrames, pending: [] };
}

export function parseModbusTcpChunk(
  data: number[],
  config: ModbusRtuConfig,
  pending: number[] = []
): ModbusRtuChunkResult {
  const bytes = pending.concat(data);
  const payloads: number[][] = [];
  const exceptions: number[] = [];
  let invalidFrames = 0;
  let cursor = 0;

  while (cursor < bytes.length) {
    if (bytes.length - cursor < 7) break;
    const protocolId = (bytes[cursor + 2] << 8) | bytes[cursor + 3];
    const length = (bytes[cursor + 4] << 8) | bytes[cursor + 5];
    if (protocolId !== 0 || length < 3 || length > 254) {
      invalidFrames += 1;
      cursor += 1;
      continue;
    }
    const frameLength = 6 + length;
    if (bytes.length - cursor < frameLength) break;
    const body = bytes.slice(cursor + 6, cursor + frameLength);
    if (collectModbusResponse(body, config, payloads, exceptions) === "invalid") invalidFrames += 1;
    cursor += frameLength;
  }

  return { payloads, exceptions, invalidFrames, pending: bytes.slice(cursor) };
}

export function modbusValueWidth(dataType: ModbusDataType): 1 | 2 {
  return dataType === "uint16" || dataType === "int16" ? 1 : 2;
}

export function createModbusChannels(config: ModbusRtuConfig): Channel[] {
  const width = modbusValueWidth(config.dataType);
  return Array.from({ length: Math.floor(config.registerCount / width) }, (_, index) => {
    const address = config.startAddress + index * width;
    return {
      key: `reg${address}`,
      sourceIndex: index,
      name: `寄存器 ${address}`,
      color: PRESET_COLORS[index % PRESET_COLORS.length],
      visible: true,
      role: "y" as const,
    };
  });
}

export function decodeModbusValues(payload: number[], config: ModbusRtuConfig): number[] {
  const width = modbusValueWidth(config.dataType);
  const values: number[] = [];
  for (let registerIndex = 0; registerIndex + width <= config.registerCount; registerIndex += width) {
    const words = Array.from({ length: width }, (_, index) =>
      payload.slice((registerIndex + index) * 2, (registerIndex + index + 1) * 2)
    );
    if (words.some((word) => word.length !== 2)) break;
    if (config.byteOrder === "little") words.forEach((word) => word.reverse());
    if (width === 2 && config.wordOrder === "little") words.reverse();

    const bytes = Uint8Array.from(words.flat());
    const view = new DataView(bytes.buffer);
    const raw = readValue(view, config.dataType);
    values.push(raw * config.scale + config.offset);
  }
  return values;
}

function readValue(view: DataView, dataType: ModbusDataType): number {
  switch (dataType) {
    case "int16":
      return view.getInt16(0);
    case "uint32":
      return view.getUint32(0);
    case "int32":
      return view.getInt32(0);
    case "float32":
      return view.getFloat32(0);
    default:
      return view.getUint16(0);
  }
}
