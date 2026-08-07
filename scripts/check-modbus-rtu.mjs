import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { buildModbusReadRequest, decodeModbusValues, modbusCrc16, parseModbusRtuChunk } =
    await server.ssrLoadModule("/src/lib/parseModbusRtu.ts");
  const { DEFAULT_CHART_CONFIG } = await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { DEFAULT_RX_FRAMING } = await server.ssrLoadModule("/src/lib/serialTypes.ts");
  const { SerialReceivePipeline } = await server.ssrLoadModule("/src/lib/serialReceivePipeline.ts");
  const { useSerialStore } = await server.ssrLoadModule("/src/stores/serialStore.ts");

  const base = {
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

  console.log("Modbus RTU 请求、流式解析和统一绘图数据检查通过");
} finally {
  await server.close();
}
