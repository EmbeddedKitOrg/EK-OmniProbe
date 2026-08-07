import { PRESET_COLORS, type Channel, type ModbusDataType, type ModbusRtuConfig } from "./chartTypes";

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
