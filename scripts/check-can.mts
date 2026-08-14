import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  SlcanStream,
  buildSlcanFrameCommand,
  buildSlcanInitCommands,
  calculateCanLoad,
  decodeCanSignal,
  estimateClassicCanBits,
  parseSlcanLine,
  slcanFrameToTelemetry,
} from "../src/lib/parseCan.ts";
import { parseDbc } from "../src/lib/parseDbc.ts";
import type { Channel } from "../src/lib/chartTypes.ts";

const standard = parseSlcanLine("t1238AABBCCDDEEFF0011");
assert.ok(standard);
assert.equal(standard.id, 0x123);
assert.equal(standard.extended, false);
assert.equal(standard.fd, false);
assert.deepEqual(standard.data, [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11]);
assert.equal(standard.estimatedBits, 133);

const extended = parseSlcanLine("T001ABCDE2AABB");
assert.ok(extended);
assert.equal(extended.id, 0x1abcde);
assert.equal(extended.extended, true);
assert.deepEqual(extended.data, [0xaa, 0xbb]);

const remote = parseSlcanLine("r3218");
assert.ok(remote);
assert.equal(remote.rtr, true);
assert.deepEqual(remote.data, []);
assert.equal(remote.estimatedBits, estimateClassicCanBits(remote));
assert.equal(parseSlcanLine("tFFF0"), null, "标准帧 ID 不得超过 0x7FF");
assert.equal(parseSlcanLine("t1239"), null, "经典 CAN DLC 不得超过 8");
assert.equal(buildSlcanFrameCommand({ id: 0x321, extended: false, rtr: true, dlc: 8, data: [] }), "r3218");

const fd = parseSlcanLine(`b1239${"AA".repeat(12)}`);
assert.ok(fd);
assert.equal(fd.fd, true);
assert.equal(fd.brs, true);
assert.equal(fd.dlc, 9);
assert.equal(fd.data.length, 12);
assert.equal(
  buildSlcanFrameCommand({ id: 0x123, extended: false, fd: true, brs: true, data: fd.data }),
  `b1239${"AA".repeat(12)}`
);
assert.deepEqual(buildSlcanInitCommands({ bitrate: 500_000, timestamps: true, initCommands: "" }), [
  "C",
  "S6",
  "Z1",
  "O",
]);
assert.deepEqual(buildSlcanInitCommands({ bitrate: 333_333, timestamps: false, initCommands: "C\n s031C \nO" }), [
  "C",
  "s031C",
  "O",
]);

const dbc = parseDbc(`
BO_ 291 VehicleStatus: 8 ECU
 SG_ Speed : 0|16@1+ (0.1,0) [0|250] "km/h" Vector__XXX
 SG_ Torque : 23|12@0- (0.5,-10) [-10|1000] "Nm" Vector__XXX
BO_ 2147483939 ExtendedFd: 12 ECU
 SG_ Counter : 0|8@1+ (1,0) [0|255] "" Vector__XXX
 SG_ Mode m1 : 8|8@1+ (1,0) [0|255] "" Vector__XXX
`);
assert.equal(dbc.messageCount, 2);
assert.equal(dbc.channels.length, 3);
assert.equal(dbc.channels[0].can?.frameId, 0x123);
assert.equal(dbc.channels[1].can?.byteOrder, "big");
assert.equal(dbc.channels[2].can?.extended, true);
assert.equal(dbc.channels[2].can?.fd, true);
assert.equal(dbc.skippedMultiplexedSignals, 1);

const stream = new SlcanStream();
const joined = new TextEncoder().encode("t1232AABB\rT001ABCDE2CCDD\r");
const first = stream.ingest([...joined.slice(0, 7)], 1_000);
assert.equal(first.frames.length, 0);
const second = stream.ingest([...joined.slice(7)], 1_001);
assert.equal(second.frames.length, 2);

const timed = new SlcanStream();
const beforeWrap = timed.ingest([...new TextEncoder().encode("t1001AAFFFE\r")], 2_000);
const afterWrap = timed.ingest([...new TextEncoder().encode("t1001AA0002\r")], 2_001);
assert.equal(beforeWrap.frames[0].timestamp, 2_000);
assert.equal(afterWrap.frames[0].timestamp, 2_004, "16 位设备时间戳应跨回绕连续展开");

const intel = {
  frameId: 0x123,
  extended: false,
  startBit: 0,
  bitLength: 16,
  byteOrder: "little" as const,
  signed: false,
  factor: 1,
  offset: 0,
};
assert.equal(decodeCanSignal([0x34, 0x12], intel), 0x1234);
assert.equal(decodeCanSignal([0x12, 0x34], { ...intel, startBit: 7, byteOrder: "big" }), 0x1234);
assert.equal(decodeCanSignal([0xfe], { ...intel, bitLength: 8, signed: true, factor: 0.5, offset: 10 }), 9);

const channel: Channel = {
  key: "speed",
  name: "车速",
  unit: "km/h",
  color: "#3b82f6",
  visible: true,
  can: { ...intel, factor: 0.1 },
};
const point = slcanFrameToTelemetry({ ...standard, timestamp: 1_000 }, [channel]);
assert.equal(point.values.speed, 0xbbaa * 0.1);
assert.equal(point.canFrame?.id, 0x123);

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });
try {
  const { SerialReceivePipeline } = await server.ssrLoadModule("/src/lib/serialReceivePipeline.ts");
  const { DEFAULT_CHART_CONFIG } = await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { DEFAULT_RX_FRAMING } = await server.ssrLoadModule("/src/lib/serialTypes.ts");
  const pipeline = new SerialReceivePipeline();
  const pipelineResult = pipeline.ingest(
    {
      direction: "rx",
      chunks: [{ data: [...new TextEncoder().encode("t1238AABBCCDDEEFF0011\r")], timestamp: 1_000 }],
    },
    {
      framing: DEFAULT_RX_FRAMING,
      chartConfig: { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "slcan", channels: [channel] },
    }
  );
  assert.equal(pipelineResult.telemetryBatch.success, 1);
  assert.equal(pipelineResult.telemetryBatch.points[0].values.speed, 0xbbaa * 0.1);
  assert.equal(pipelineResult.telemetryBatch.points[0].canFrame?.id, 0x123);
} finally {
  await server.close();
}

const load = calculateCanLoad(
  [
    { ...point, timestamp: 950 },
    { ...point, timestamp: 1_000 },
    { ...point, timestamp: 800 },
  ],
  { bitrate: 500_000, dataBitrate: 2_000_000, loadWindowMs: 100 },
  1_000
);
assert.equal(load.frameCount, 2);
assert.equal(load.totalBits, standard.estimatedBits * 2);
assert.equal(load.perId[0].frameCount, 2);
assert.equal(load.loadRatio, (standard.estimatedBits * 2) / 50_000);

console.log("SLCAN 帧、位域信号和总线负载检查通过");
