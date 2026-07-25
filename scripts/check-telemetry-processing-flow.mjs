import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

const channel = (key) => ({ key, name: key, color: "#2563eb", visible: true, role: "y" });

try {
  const { DEFAULT_CHART_CONFIG } = await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { DEFAULT_RX_FRAMING } = await server.ssrLoadModule("/src/lib/serialTypes.ts");
  const { SerialReceivePipeline } = await server.ssrLoadModule("/src/lib/serialReceivePipeline.ts");
  const { createSimulationSample } = await server.ssrLoadModule("/src/lib/serialSimulation.ts");
  const { parseChartLines } = await server.ssrLoadModule("/src/lib/parseChartData.ts");
  const { resolveTelemetryProcessing } = await server.ssrLoadModule("/src/lib/telemetry.ts");
  const { ImuFusionProcessor } = await server.ssrLoadModule("/src/lib/imuFusion.ts");
  const { useSerialStore } = await server.ssrLoadModule("/src/stores/serialStore.ts");
  const { useRttStore } = await server.ssrLoadModule("/src/stores/rttStore.ts");
  const { useBluetoothStore } = await server.ssrLoadModule("/src/stores/bluetoothStore.ts");

  const simulationConfig = {
    preset: "filter-demo",
    sampleRateHz: 200,
    frequencyHz: 5,
    amplitude: 1,
    offset: 0,
    noise: 0,
    channelCount: 1,
    waveform: "sine",
    xyPattern: "circle",
  };
  const chartConfig = {
    ...DEFAULT_CHART_CONFIG,
    enabled: true,
    parseMode: "json",
    maxDataPoints: 8,
    channels: [channel("signal")],
    dataFilter: {
      ...DEFAULT_CHART_CONFIG.dataFilter,
      enabled: true,
      kind: "fir",
      firCoefficients: [0.5, 0.5],
    },
  };
  const payload = Array.from({ length: 12 }, (_, index) =>
    JSON.stringify(createSimulationSample(simulationConfig, index / simulationConfig.sampleRateHz))
  ).join("\n");
  const pipeline = new SerialReceivePipeline();
  const receive = pipeline.ingest(
    {
      direction: "rx",
      chunks: [{ data: Array.from(new TextEncoder().encode(`${payload}\n`)), timestamp: 1_000 }],
    },
    { framing: DEFAULT_RX_FRAMING, chartConfig }
  );
  assert.equal(receive.telemetryBatch.points.length, 12);
  assert.deepEqual(
    { success: receive.telemetryBatch.success, fail: receive.telemetryBatch.fail },
    { success: 12, fail: 0 }
  );

  const emptyProcessingState = {
    chartData: [],
    processedChartData: [],
    filterActive: false,
    chartConfig,
    parseSuccessCount: 0,
    parseFailCount: 0,
  };
  useSerialStore.setState(emptyProcessingState);
  useRttStore.setState(emptyProcessingState);
  useBluetoothStore.setState(emptyProcessingState);

  useSerialStore.getState().commitSerialReceiveBatch(receive);
  useRttStore.getState().addChartDataBatch(receive.telemetryBatch.points);
  useRttStore.getState().incrementParseCounts(receive.telemetryBatch.success, receive.telemetryBatch.fail);
  useBluetoothStore.getState().addChartDataBatch(receive.telemetryBatch.points);
  useBluetoothStore.getState().incrementParseCounts(receive.telemetryBatch.success, receive.telemetryBatch.fail);

  const sourceStates = [useSerialStore.getState(), useRttStore.getState(), useBluetoothStore.getState()];
  const expected = resolveTelemetryProcessing(
    receive.telemetryBatch.points.slice(-chartConfig.maxDataPoints),
    chartConfig.channels,
    chartConfig.dataFilter
  );
  for (const state of sourceStates) {
    assert.deepEqual(state.chartData, expected.rawData);
    assert.deepEqual(state.processedChartData, expected.processedData);
    assert.equal(state.filterActive, true);
    assert.deepEqual({ success: state.parseSuccessCount, fail: state.parseFailCount }, { success: 12, fail: 0 });
  }
  assert.deepEqual(sourceStates[0].processedChartData, sourceStates[1].processedChartData);
  assert.deepEqual(sourceStates[1].processedChartData, sourceStates[2].processedChartData);

  const detachedSnapshot = structuredClone({
    chartData: sourceStates[0].chartData,
    processedChartData: sourceStates[0].filterActive ? sourceStates[0].processedChartData : undefined,
    filterActive: sourceStates[0].filterActive,
  });
  assert.equal(detachedSnapshot.filterActive, true);
  assert.deepEqual(detachedSnapshot.processedChartData, expected.processedData);

  const disabledConfig = {
    ...chartConfig,
    dataFilter: { ...chartConfig.dataFilter, enabled: false },
  };
  useSerialStore.getState().setChartConfig(disabledConfig);
  useRttStore.getState().setChartConfig(disabledConfig);
  useBluetoothStore.getState().setChartConfig(disabledConfig);
  for (const state of [useSerialStore.getState(), useRttStore.getState(), useBluetoothStore.getState()]) {
    assert.equal(state.filterActive, false);
    assert.equal(state.processedChartData, state.chartData);
  }

  const imuSimulationConfig = { ...simulationConfig, preset: "imu6", frequencyHz: 0.5 };
  const imuChannels = ["ax", "ay", "az", "gx", "gy", "gz"].map(channel);
  const imuChartConfig = {
    ...DEFAULT_CHART_CONFIG,
    enabled: true,
    parseMode: "json",
    channels: imuChannels,
  };
  const imuBatch = parseChartLines(
    Array.from({ length: 20 }, (_, index) => ({
      text: JSON.stringify(createSimulationSample(imuSimulationConfig, index / 100)),
      timestamp: 2_000 + index * 10,
    })),
    imuChartConfig
  );
  const orientation = new ImuFusionProcessor().process(imuBatch.points, {
    accelXChannel: "ax",
    accelYChannel: "ay",
    accelZChannel: "az",
    gyroXChannel: "gx",
    gyroYChannel: "gy",
    gyroZChannel: "gz",
    gyroUnit: "dps",
    sampleRateHz: 100,
    filterAlpha: 0.98,
    gyroBiasX: 0,
    gyroBiasY: 0,
    gyroBiasZ: 0,
  });
  assert.ok(orientation);
  assert.ok(Object.values(orientation).every(Number.isFinite));

  useSerialStore.getState().clearChartData();
  useRttStore.getState().clearChartData();
  useBluetoothStore.getState().clearChartData();
  for (const state of [useSerialStore.getState(), useRttStore.getState(), useBluetoothStore.getState()]) {
    assert.deepEqual(state.chartData, []);
    assert.deepEqual(state.processedChartData, []);
    assert.equal(state.filterActive, false);
  }

  console.log("遥测处理层模拟流程检查通过");
} finally {
  await server.close();
}
