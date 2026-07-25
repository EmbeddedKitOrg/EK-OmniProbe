import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

const encoder = new TextEncoder();
const chunk = (data, timestamp) => ({ data: Array.from(data), timestamp });

function encodeJustFloat(values) {
  const payload = new Uint8Array(values.length * 4 + 4);
  const view = new DataView(payload.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  payload.set([0x00, 0x00, 0x80, 0x7f], values.length * 4);
  return payload;
}

try {
  const { mergeSerialReceiveResults, SerialReceivePipeline } = await server.ssrLoadModule(
    "/src/lib/serialReceivePipeline.ts"
  );
  const { DEFAULT_CHART_CONFIG } = await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { DEFAULT_RX_FRAMING } = await server.ssrLoadModule("/src/lib/serialTypes.ts");
  const { useSerialStore } = await server.ssrLoadModule("/src/stores/serialStore.ts");
  const jsonConfig = {
    framing: DEFAULT_RX_FRAMING,
    chartConfig: { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "json", channels: [] },
  };

  const pipeline = new SerialReceivePipeline();
  const jsonBytes = encoder.encode('{"signal":1.25}\n');
  const first = pipeline.ingest({ direction: "rx", chunks: [chunk(jsonBytes.slice(0, 7), 1000)] }, jsonConfig);
  const second = pipeline.ingest({ direction: "rx", chunks: [chunk(jsonBytes.slice(7), 1005)] }, jsonConfig);
  assert.equal(first.lines.length, 0);
  assert.equal(first.telemetryBatch.points.length, 0);
  assert.equal(first.terminalText + second.terminalText, '{"signal":1.25}\n');
  assert.equal(second.lines[0].text, '{"signal":1.25}');
  assert.equal(second.lines[0].timestamp.getTime(), 1005);
  assert.deepEqual(second.telemetryBatch.points[0], { timestamp: 1005, values: { signal: 1.25 } });
  assert.equal(first.bytesReceived + second.bytesReceived, jsonBytes.length);
  const merged = mergeSerialReceiveResults([first, second]);
  assert.equal(merged.terminalText, '{"signal":1.25}\n');
  assert.equal(merged.lines.length, 1);
  assert.deepEqual(merged.telemetryBatch, second.telemetryBatch);
  assert.equal(merged.bytesReceived, jsonBytes.length);

  useSerialStore.setState({
    lines: [],
    lineIdCounter: 0,
    stats: { bytes_received: 0, bytes_sent: 7 },
    terminalLines: [],
    terminalActiveLine: "",
    terminalActiveUnits: [],
    terminalCursorColumn: 0,
    terminalPendingEscape: "",
    terminalLineCounter: 0,
    chartData: [],
    processedChartData: [],
    chartConfig: jsonConfig.chartConfig,
    parseSuccessCount: 0,
    parseFailCount: 0,
  });
  useSerialStore.getState().commitSerialReceiveBatch(merged);
  const committed = useSerialStore.getState();
  assert.equal(committed.lines[0].id, 1);
  assert.equal(committed.terminalLines[0].text, '{"signal":1.25}');
  assert.deepEqual(committed.chartData, merged.telemetryBatch.points);
  assert.equal(committed.processedChartData, committed.chartData);
  assert.equal(committed.parseSuccessCount, 1);
  assert.deepEqual(committed.stats, { bytes_received: jsonBytes.length, bytes_sent: 7 });

  pipeline.reset();
  const utf8Bytes = encoder.encode("温度:25");
  const splitIndex = 2;
  const utf8First = pipeline.ingest(
    { direction: "rx", chunks: [chunk(utf8Bytes.slice(0, splitIndex), 2000)] },
    jsonConfig
  );
  const utf8Second = pipeline.ingest(
    { direction: "rx", chunks: [chunk(utf8Bytes.slice(splitIndex), 2001)] },
    jsonConfig
  );
  const idle = pipeline.flushPending(jsonConfig, 2200);
  assert.equal(utf8First.terminalText + utf8Second.terminalText, "温度:25");
  assert.equal(idle.lines[0].text, "温度:25");
  assert.equal(idle.lines[0].timestamp.getTime(), 2200);
  assert.equal(idle.telemetryBatch.fail, 1);

  pipeline.reset();
  const idleJson = encoder.encode('{"signal":2.5}');
  pipeline.ingest({ direction: "rx", chunks: [chunk(idleJson, 3000)] }, jsonConfig);
  const idleJsonResult = pipeline.flushPending(jsonConfig, 3200);
  assert.deepEqual(idleJsonResult.telemetryBatch.points[0], { timestamp: 3200, values: { signal: 2.5 } });

  pipeline.reset();
  const justFloatBytes = encodeJustFloat([1.5, -2.25]);
  const justFloatConfig = {
    framing: DEFAULT_RX_FRAMING,
    chartConfig: { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "justfloat", channels: [] },
  };
  const justFloatFirst = pipeline.ingest(
    { direction: "rx", chunks: [chunk(justFloatBytes.slice(0, 5), 4000)] },
    justFloatConfig
  );
  const justFloatSecond = pipeline.ingest(
    { direction: "rx", chunks: [chunk(justFloatBytes.slice(5), 4005)] },
    justFloatConfig
  );
  assert.equal(justFloatFirst.telemetryBatch.points.length, 0);
  assert.deepEqual(
    justFloatSecond.detectedChannels.map(({ key, sourceIndex }) => ({ key, sourceIndex })),
    [
      { key: "ch1", sourceIndex: 0 },
      { key: "ch2", sourceIndex: 1 },
    ]
  );
  assert.deepEqual(justFloatSecond.telemetryBatch.points[0], {
    timestamp: 4005,
    values: { ch1: 1.5, ch2: -2.25 },
  });
  const mergedJustFloat = mergeSerialReceiveResults([justFloatFirst, justFloatSecond]);
  assert.equal(mergedJustFloat.detectedChannels.length, 2);
  useSerialStore.setState({ chartConfig: justFloatConfig.chartConfig, chartData: [] });
  useSerialStore.getState().commitSerialReceiveBatch(mergedJustFloat);
  assert.equal(useSerialStore.getState().chartConfig.channels.length, 2);

  pipeline.reset();
  assert.equal(pipeline.flushPending(jsonConfig).lines.length, 0);
  console.log("串口接收流水线检查通过");
} finally {
  await server.close();
}
