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

  // buildChartDisplayRows 现在用 min/max 包络而非等距抽取，契约是
  // 「点数不超过 limit，且极值必定保留」——不再保证正好返回 limit 个点。
  // 此前这里锁死的是等距抽取选出的具体下标 [0, 2, 3]，那是实现细节；
  // 真正需要守住的是极值不丢（丢了会让波形和纵轴一起失真）。
  const rows = buildChartDisplayRows(processing.processedData, 3);
  assert.ok(rows.length <= 3, `点数应不超过 limit，实际 ${rows.length}`);
  assert.ok(rows.length >= 2, "至少应保留首尾两点");

  const signals = rows.map((row) => row.signal);
  assert.ok(signals.includes(0.5), `最小值 0.5 应被保留，实际 ${JSON.stringify(signals)}`);
  assert.ok(signals.includes(6), `最大值 6 应被保留，实际 ${JSON.stringify(signals)}`);

  // 下标升序、字段结构与时间格式仍需正确
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].index > rows[i - 1].index, "下标应严格升序");
  }
  assert.deepEqual(
    { index: rows[0].index, time: rows[0].time, signal: rows[0].signal },
    { index: 0, time: "0.000", signal: 0.5 }
  );
  assert.deepEqual(
    { index: rows[rows.length - 1].index, time: rows[rows.length - 1].time, signal: rows[rows.length - 1].signal },
    { index: 3, time: "0.030", signal: 6 }
  );
  assert.deepEqual(calculateChartStatistics(processing.processedData, [channel]), {
    signal: { min: 0.5, max: 6, avg: 3.125, latest: 6 },
  });

  const sampleRateHz = 200;
  const sampleCount = 1000;
  const signalFrequencyHz = 6.25;
  const spectrum = calculateSpectrum(
    Array.from({ length: sampleCount }, (_, index) =>
      Math.sin((2 * Math.PI * signalFrequencyHz * index) / sampleRateHz)
    ),
    sampleRateHz
  );
  const peak = spectrum.slice(1).reduce((highest, bin) => (bin.magnitude > highest.magnitude ? bin : highest));
  assert.equal(peak.freq, signalFrequencyHz);
  assert.ok(Math.abs(peak.magnitude) < 0.01, `Hann 补偿后单位正弦峰值应为 0 dB，实际 ${peak.magnitude} dB`);
  const dc = calculateSpectrum(
    Array.from({ length: sampleCount }, () => 1),
    sampleRateHz
  );
  assert.ok(Math.abs(dc[0].magnitude) < 1e-9, `DC 不应应用单边频谱倍增，实际 ${dc[0].magnitude} dB`);

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
