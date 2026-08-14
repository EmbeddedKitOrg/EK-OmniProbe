import assert from "node:assert/strict";
import {
  BINARY_CHECKSUM_PRESETS,
  BinaryProtocolStream,
  DEFAULT_BINARY_PROTOCOL_CONFIG,
  calculateChecksum,
  decodeBinaryFrame,
  sanitizeBinaryProtocolConfig,
  validateBinaryProtocolConfig,
  type BinaryFieldConfig,
  type BinaryProtocolConfig,
} from "../src/lib/binaryProtocol.ts";

const vector = Array.from(new TextEncoder().encode("123456789"));
for (const [presetId, expected] of [
  ["crc8", 0xf4],
  ["crc8-maxim", 0xa1],
  ["crc16-modbus", 0x4b37],
  ["crc16-ccitt-false", 0x29b1],
  ["crc16-xmodem", 0x31c3],
  ["crc32", 0xcbf43926],
] as const) {
  const preset = BINARY_CHECKSUM_PRESETS.find(({ id }) => id === presetId);
  assert.ok(preset, `${presetId} 预设不存在`);
  const config = { ...DEFAULT_BINARY_PROTOCOL_CONFIG.checksum, ...preset.config };
  assert.equal(calculateChecksum(vector, config), expected, `${preset.label} 标准检查向量错误`);
}

const field = (patch: Partial<BinaryFieldConfig>): BinaryFieldConfig => ({
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
  ...patch,
});

const protocol = sanitizeBinaryProtocolConfig({
  ...structuredClone(DEFAULT_BINARY_PROTOCOL_CONFIG),
  messages: [
    {
      id: "status",
      name: "状态",
      matchOffset: 2,
      matchBytes: [1],
      matchMask: [0xff],
      fields: [field({ key: "temperature", name: "温度", scale: 0.1, bias: -40 })],
    },
    {
      id: "rtc",
      name: "RTC",
      matchOffset: 2,
      matchBytes: [2],
      matchMask: [0xff],
      fields: [field({ key: "clock", name: "时间", type: "bcd16", byteOrder: "big" })],
    },
    {
      id: "fallback",
      name: "默认",
      matchOffset: 2,
      matchBytes: [],
      matchMask: [],
      fields: [field({ key: "raw", name: "原始值" })],
    },
  ],
});

assert.deepEqual(validateBinaryProtocolConfig(protocol), []);

function lengthFrame(type: number, payload: number[], config: BinaryProtocolConfig = protocol): number[] {
  const body = [0x55, 0xaa, type, payload.length, ...payload];
  const crc = calculateChecksum(body, config.checksum);
  return [...body, crc & 0xff, (crc >>> 8) & 0xff];
}

const statusFrame = lengthFrame(1, [0x01, 0x02]);
const decodedStatus = decodeBinaryFrame(statusFrame, protocol);
assert.equal(decodedStatus.success, true);
assert.equal(decodedStatus.messageId, "status");
assert.ok(Math.abs(decodedStatus.values.temperature - 11.3) < 1e-12);

const decodedRtc = decodeBinaryFrame(lengthFrame(2, [0x12, 0x34]), protocol);
assert.equal(decodedRtc.success, true);
assert.equal(decodedRtc.values.clock, 1234);

for (let chunkSize = 1; chunkSize <= statusFrame.length; chunkSize += 1) {
  const stream = new BinaryProtocolStream(protocol);
  const output = [];
  const bytes = [0x00, 0xff, ...statusFrame, ...lengthFrame(2, [0x12, 0x34])];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output.push(...stream.ingest(bytes.slice(offset, offset + chunkSize)).frames);
  }
  assert.deepEqual(
    output.map(({ messageId }) => messageId),
    ["status", "rtc"],
    `chunkSize=${chunkSize} 拆包或帧头重同步失败`
  );
}

{
  const corrupted = statusFrame.slice();
  corrupted[4] ^= 0x80;
  const stream = new BinaryProtocolStream(protocol);
  const result = stream.ingest([...corrupted, ...statusFrame]);
  assert.ok(result.invalidFrames > 0, "CRC 错帧应计入失败");
  assert.equal(result.frames.length, 1, "CRC 错帧后应重新同步到下一帧");
}

{
  const delimiterProtocol = sanitizeBinaryProtocolConfig({
    ...structuredClone(DEFAULT_BINARY_PROTOCOL_CONFIG),
    frame: {
      ...DEFAULT_BINARY_PROTOCOL_CONFIG.frame,
      header: [0x7e],
      mode: "delimiter",
      delimiter: [0x0d, 0x0a],
      payloadOffset: 1,
    },
    checksum: { ...DEFAULT_BINARY_PROTOCOL_CONFIG.checksum, algorithm: "none" },
    messages: [
      {
        id: "default",
        name: "默认",
        matchOffset: 0,
        matchBytes: [],
        matchMask: [],
        fields: [field({ key: "byte", name: "字节", type: "uint8", stride: 1 })],
      },
    ],
  });
  const stream = new BinaryProtocolStream(delimiterProtocol);
  const first = stream.ingest([0x7e, 5, 0x0d]);
  assert.equal(first.frames.length, 0);
  const second = stream.ingest([0x0a, 0x7e, 9, 0x0d, 0x0a]);
  assert.deepEqual(second.frames.map(({ values }) => values.byte), [5, 9]);
}

{
  const invalid = structuredClone(protocol);
  invalid.messages[1].fields[0].key = "temperature";
  assert.ok(validateBinaryProtocolConfig(invalid).some((error) => error.includes("字段 key 重复")));
}

console.log("通用二进制协议检查通过");
