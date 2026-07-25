import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { DEFAULT_CHART_CONFIG } = await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { resolveTelemetryProcessing } = await server.ssrLoadModule("/src/lib/telemetry.ts");
  const { buildChartDisplayRows, calculateChartStatistics, calculateSpectrum } = await server.ssrLoadModule(
    "/src/lib/chartPresentation.ts"
  );
  const { serializeChartDataAsCsv } = await server.ssrLoadModule("/src/lib/exporters.ts");

  const channel = { key: "signal", name: "Signal", color: "#2563eb", visible: true, role: "y" };
  const rawData = [1, 3, 5, 7].map((signal, index) => ({
    timestamp: 1_000 + index * 10,
    values: { signal },
  }));
  const chartConfig = {
    ...DEFAULT_CHART_CONFIG,
    channels: [channel],
    dataFilter: {
      ...DEFAULT_CHART_CONFIG.dataFilter,
      enabled: true,
      kind: "fir",
      firCoefficients: [0.5, 0.5],
    },
  };
  const processing = resolveTelemetryProcessing(rawData, chartConfig.channels, chartConfig.dataFilter);
  assert.equal(processing.filterActive, true);

  const rows = buildChartDisplayRows(processing.processedData, 3);
  assert.deepEqual(
    rows.map(({ index, time, signal }) => ({ index, time, signal })),
    [
      { index: 0, time: "0.000", signal: 0.5 },
      { index: 2, time: "0.020", signal: 4 },
      { index: 3, time: "0.030", signal: 6 },
    ]
  );
  assert.deepEqual(calculateChartStatistics(processing.processedData, [channel]), {
    signal: { min: 0.5, max: 6, avg: 3.125, latest: 6 },
  });

  const sampleRateHz = 128;
  const spectrum = calculateSpectrum(
    Array.from({ length: sampleRateHz }, (_, index) => Math.sin((2 * Math.PI * 5 * index) / sampleRateHz)),
    sampleRateHz
  );
  const peak = spectrum.slice(1).reduce((highest, bin) => (bin.magnitude > highest.magnitude ? bin : highest));
  assert.equal(peak.freq, 5);

  const rawCsv = serializeChartDataAsCsv(rawData, chartConfig);
  const processedCsv = serializeChartDataAsCsv(processing.processedData, chartConfig);
  const comparisonCsv = serializeChartDataAsCsv(processing.processedData, chartConfig, rawData);
  assert.equal(rawCsv.split("\n")[1].split(",")[1], "1");
  assert.equal(processedCsv.split("\n")[1].split(",")[1], "0.5");
  assert.equal(comparisonCsv.split("\n")[0], "timestamp,Signal (处理后),Signal (原始)");
  assert.deepEqual(comparisonCsv.split("\n")[1].split(",").slice(1), ["0.5", "1"]);

  console.log("遥测消费与展示模型模拟流程检查通过");
} finally {
  await server.close();
}
