import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const {
    buildModbusAsciiReadRequest,
    buildModbusReadRequest,
    buildModbusTcpReadRequest,
    decodeModbusValues,
    modbusCrc16,
    modbusLrc,
    parseModbusAsciiChunk,
    parseModbusRtuChunk,
    parseModbusTcpChunk,
    shouldAutoPollModbus,
  } = await server.ssrLoadModule("/src/lib/parseModbusRtu.ts");
  const { DEFAULT_CHART_CONFIG, migrateChartConfig } = await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { DEFAULT_RX_FRAMING } = await server.ssrLoadModule("/src/lib/serialTypes.ts");
  const { SerialReceivePipeline } = await server.ssrLoadModule("/src/lib/serialReceivePipeline.ts");
  const { useSerialStore } = await server.ssrLoadModule("/src/stores/serialStore.ts");

  const base = {
    autoPoll: true,
    slaveId: 1,
    functionCode: 3,
    startAddress: 0,
    registerCount: 2,
    pollIntervalMs: 200,
    dataType: "uint16",
    byteOrder: "big",
    wordOrder: "big",
    scale: 1,
    offset: 0,
  };
  const frame = (payload, functionCode = base.functionCode) => {
    const body = [base.slaveId, functionCode, payload.length, ...payload];
    const crc = modbusCrc16(body);
    return [...body, crc & 0xff, crc >>> 8];
  };
  const asciiFrame = (payload, functionCode = base.functionCode) => {
    const body = [base.slaveId, functionCode, payload.length, ...payload];
    const encoded = [...body, modbusLrc(body)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return Array.from(new TextEncoder().encode(`:${encoded}\r\n`));
  };
  const tcpFrame = (payload, functionCode = base.functionCode, transactionId = 0x1234) => {
    const pdu = [functionCode, payload.length, ...payload];
    const length = 1 + pdu.length;
    return [transactionId >>> 8, transactionId & 0xff, 0, 0, length >>> 8, length & 0xff, base.slaveId, ...pdu];
  };

  assert.deepEqual(
    buildModbusReadRequest({ ...base, registerCount: 10 }),
    [0x01, 0x03, 0x00, 0x00, 0x00, 0x0a, 0xc5, 0xcd]
  );

  const response = frame([0x00, 0x0a, 0x00, 0x14]);
  const first = parseModbusRtuChunk(response.slice(0, 4), base);
  assert.equal(first.payloads.length, 0);
  const second = parseModbusRtuChunk(response.slice(4), base, first.pending);
  assert.deepEqual(second.payloads, [[0x00, 0x0a, 0x00, 0x14]]);
  assert.equal(second.pending.length, 0);

  const joined = parseModbusRtuChunk([...response, ...response], base);
  assert.equal(joined.payloads.length, 2);
  const damaged = response.slice();
  damaged[3] ^= 0xff;
  assert.equal(parseModbusRtuChunk(damaged, base).invalidFrames, 1);

  assert.deepEqual(
    buildModbusAsciiReadRequest({ ...base, registerCount: 10 }),
    Array.from(new TextEncoder().encode(":01030000000AF2\r\n"))
  );
  const asciiResponse = asciiFrame([0x00, 0x0a, 0x00, 0x14]);
  const asciiFirst = parseModbusAsciiChunk(asciiResponse.slice(0, 7), base);
  assert.equal(asciiFirst.payloads.length, 0);
  const asciiSecond = parseModbusAsciiChunk(asciiResponse.slice(7), base, asciiFirst.pending);
  assert.deepEqual(asciiSecond.payloads, [[0x00, 0x0a, 0x00, 0x14]]);
  const badAscii = asciiResponse.slice();
  badAscii[badAscii.length - 4] = badAscii[badAscii.length - 4] === 0x30 ? 0x31 : 0x30;
  assert.equal(parseModbusAsciiChunk(badAscii, base).invalidFrames, 1);

  assert.deepEqual(
    buildModbusTcpReadRequest({ ...base, registerCount: 10 }, 0x1234),
    [0x12, 0x34, 0, 0, 0, 6, 1, 3, 0, 0, 0, 10]
  );
  const tcpResponse = tcpFrame([0x00, 0x0a, 0x00, 0x14]);
  const tcpFirst = parseModbusTcpChunk(tcpResponse.slice(0, 8), base);
  assert.equal(tcpFirst.payloads.length, 0);
  const tcpSecond = parseModbusTcpChunk(tcpResponse.slice(8), base, tcpFirst.pending);
  assert.deepEqual(tcpSecond.payloads, [[0x00, 0x0a, 0x00, 0x14]]);
  const badTcp = tcpResponse.slice();
  badTcp[3] = 1;
  assert.ok(parseModbusTcpChunk(badTcp, base).invalidFrames > 0);

  assert.equal(shouldAutoPollModbus("modbus-rtu", { ...base, autoPoll: false }, "local"), false);
  assert.equal(shouldAutoPollModbus("modbus-ascii", base, "local"), true);
  assert.equal(shouldAutoPollModbus("modbus-tcp", base, "tcp"), true);
  assert.equal(shouldAutoPollModbus("modbus-tcp", base, "local"), false);
  assert.equal(
    migrateChartConfig({ ...DEFAULT_CHART_CONFIG, modbusRtu: { ...base, autoPoll: false } }).modbusRtu.autoPoll,
    false
  );
  const legacyModbus = { ...base };
  delete legacyModbus.autoPoll;
  assert.equal(migrateChartConfig({ ...DEFAULT_CHART_CONFIG, modbusRtu: legacyModbus }).modbusRtu.autoPoll, true);

  const floatConfig = { ...base, dataType: "float32", registerCount: 2 };
  assert.deepEqual(decodeModbusValues([0x3f, 0x80, 0x00, 0x00], floatConfig), [1]);
  assert.deepEqual(decodeModbusValues([0x00, 0x00, 0x3f, 0x80], { ...floatConfig, wordOrder: "little" }), [1]);
  assert.deepEqual(decodeModbusValues([0x80, 0x3f, 0x00, 0x00], { ...floatConfig, byteOrder: "little" }), [1]);

  const chartConfig = {
    ...DEFAULT_CHART_CONFIG,
    enabled: true,
    parseMode: "modbus-rtu",
    channels: [],
    modbusRtu: { ...base, startAddress: 100, scale: 0.1, offset: -1 },
  };
  const pipeline = new SerialReceivePipeline();
  const result = pipeline.ingest(
    { direction: "rx", chunks: [{ data: response, timestamp: 1234 }] },
    { framing: DEFAULT_RX_FRAMING, chartConfig }
  );
  assert.deepEqual(
    result.detectedChannels.map(({ key, sourceIndex }) => ({ key, sourceIndex })),
    [
      { key: "reg100", sourceIndex: 0 },
      { key: "reg101", sourceIndex: 1 },
    ]
  );
  assert.deepEqual(result.telemetryBatch.points, [{ timestamp: 1234, values: { reg100: 0, reg101: 1 } }]);
  assert.deepEqual(
    { success: result.telemetryBatch.success, fail: result.telemetryBatch.fail },
    { success: 1, fail: 0 }
  );
  for (const [parseMode, protocolResponse] of [
    ["modbus-ascii", asciiResponse],
    ["modbus-tcp", tcpResponse],
  ]) {
    const protocolResult = new SerialReceivePipeline().ingest(
      { direction: "rx", chunks: [{ data: protocolResponse, timestamp: 1234 }] },
      { framing: DEFAULT_RX_FRAMING, chartConfig: { ...chartConfig, parseMode } }
    );
    assert.deepEqual(protocolResult.telemetryBatch.points, [{ timestamp: 1234, values: { reg100: 0, reg101: 1 } }]);
  }
  useSerialStore.setState({
    chartConfig,
    chartData: [],
    processedChartData: [],
    parseSuccessCount: 0,
    parseFailCount: 0,
  });
  useSerialStore.getState().commitSerialReceiveBatch(result);
  assert.deepEqual(useSerialStore.getState().chartData, result.telemetryBatch.points);
  assert.deepEqual(
    useSerialStore.getState().chartConfig.channels.map(({ key }) => key),
    ["reg100", "reg101"]
  );

  const exceptionBody = [base.slaveId, base.functionCode | 0x80, 0x02];
  const exceptionCrc = modbusCrc16(exceptionBody);
  const exception = [...exceptionBody, exceptionCrc & 0xff, exceptionCrc >>> 8];
  const failed = pipeline.ingest(
    { direction: "rx", chunks: [{ data: exception, timestamp: 1235 }] },
    { framing: DEFAULT_RX_FRAMING, chartConfig }
  );
  assert.equal(failed.telemetryBatch.fail, 1);

  console.log("Modbus RTU/ASCII/TCP 请求、流式解析、轮询开关和统一绘图数据检查通过");
} finally {
  await server.close();
}
