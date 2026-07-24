import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { populateEmptyChannelsFromSamples } = await server.ssrLoadModule("/src/lib/chartAutoConfig.ts");
  const { DEFAULT_CHART_CONFIG, getSignalWorkspaceTransition, isSignalWorkspaceActive, migrateChartConfig } =
    await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { applyDataFilter, parseMatlabSos, parseMatlabVector } =
    await server.ssrLoadModule("/src/lib/chartFilter.ts");
  const { traceSignalPath } = await server.ssrLoadModule("/src/components/rtt/SignalPlotCanvas.tsx");

  assert.equal(DEFAULT_CHART_CONFIG.waveformInterpolation, "linear");
  assert.equal(migrateChartConfig({ waveformInterpolation: "smooth" }).waveformInterpolation, "smooth");
  assert.equal(migrateChartConfig({ waveformInterpolation: "invalid" }).waveformInterpolation, "linear");
  assert.deepEqual(parseMatlabVector("b = [0.25 0.5 0.25]"), [0.25, 0.5, 0.25]);
  assert.deepEqual(parseMatlabSos("1 0 0 1 0 0;\n1 2 1 1 -1.5 0.7"), [
    [1, 0, 0, 1, 0, 0],
    [1, 2, 1, 1, -1.5, 0.7],
  ]);
  assert.equal(parseMatlabSos("1 2 3"), null);

  const samples = [2, 4, 6].map((value, index) => ({ timestamp: index, values: { ch1: value } }));
  const firResult = applyDataFilter(samples, ["ch1"], {
    ...DEFAULT_CHART_CONFIG.dataFilter,
    enabled: true,
    kind: "fir",
    firCoefficients: [0.5, 0.5],
  });
  assert.deepEqual(
    firResult.map((point) => point.values.ch1),
    [1, 3, 5]
  );
  assert.deepEqual(
    samples.map((point) => point.values.ch1),
    [2, 4, 6]
  );

  const sosResult = applyDataFilter(samples, ["ch1"], {
    ...DEFAULT_CHART_CONFIG.dataFilter,
    enabled: true,
    kind: "sos",
    sosSections: [[1, 0, 0, 1, 0, 0]],
    scaleValues: [2],
  });
  assert.deepEqual(
    sosResult.map((point) => point.values.ch1),
    [4, 8, 12]
  );
  const recursiveResult = applyDataFilter(
    [1, 0, 0].map((value, index) => ({ timestamp: index, values: { ch1: value } })),
    ["ch1"],
    {
      ...DEFAULT_CHART_CONFIG.dataFilter,
      enabled: true,
      kind: "sos",
      sosSections: [[1, 0, 0, 1, -0.5, 0]],
    }
  );
  assert.deepEqual(
    recursiveResult.map((point) => point.values.ch1),
    [1, 0.5, 0.25]
  );
  const medianResult = applyDataFilter(samples, ["ch1"], {
    ...DEFAULT_CHART_CONFIG.dataFilter,
    enabled: true,
    kind: "median",
    medianWindowSize: 3,
  });
  assert.equal(medianResult.at(-1).values.ch1, 4);

  const pathCalls = [];
  const pathContext = {
    moveTo: (...args) => pathCalls.push(["moveTo", ...args]),
    lineTo: (...args) => pathCalls.push(["lineTo", ...args]),
    bezierCurveTo: (...args) => pathCalls.push(["bezierCurveTo", ...args]),
  };
  const points = [
    { x: 0, y: 5 },
    { x: 10, y: 0 },
    { x: 20, y: 10 },
  ];
  traceSignalPath(pathContext, points, "linear");
  assert.deepEqual(
    pathCalls.map(([command]) => command),
    ["moveTo", "lineTo", "lineTo"]
  );
  pathCalls.length = 0;
  traceSignalPath(pathContext, points, "smooth");
  assert.deepEqual(
    pathCalls.map(([command]) => command),
    ["moveTo", "bezierCurveTo", "bezierCurveTo"]
  );
  assert.deepEqual(pathCalls.at(-1).slice(-2), [20, 10]);

  const auto = populateEmptyChannelsFromSamples(DEFAULT_CHART_CONFIG, [{ text: "1,2" }, { text: "3,4" }]);
  assert.equal(auto.parseMode, "delimiter");
  assert.equal(auto.channels.length, 2);

  const json = populateEmptyChannelsFromSamples({ ...DEFAULT_CHART_CONFIG, parseMode: "json" }, [
    { text: '{"temp":25.1,"humi":48}' },
  ]);
  assert.deepEqual(
    json.channels.map((channel) => channel.key),
    ["temp", "humi"]
  );

  const delimiter = populateEmptyChannelsFromSamples(
    { ...DEFAULT_CHART_CONFIG, parseMode: "delimiter", delimiter: "," },
    [{ text: "ok,10,20" }, { text: "ok,11,21" }]
  );
  assert.deepEqual(
    delimiter.channels.map(({ key, sourceIndex }) => [key, sourceIndex]),
    [
      ["field2", 1],
      ["field3", 2],
    ]
  );

  const configured = { ...DEFAULT_CHART_CONFIG, channels: [delimiter.channels[0]] };
  assert.equal(populateEmptyChannelsFromSamples(configured, [{ text: "1,2,3" }]), configured);

  const opened = getSignalWorkspaceTransition("text", DEFAULT_CHART_CONFIG, "time");
  assert.equal(opened.viewMode, "split");
  assert.equal(isSignalWorkspaceActive(opened.viewMode, opened.chartConfig, "time"), true);

  const switched = getSignalWorkspaceTransition(opened.viewMode, opened.chartConfig, "fft");
  assert.equal(switched.viewMode, "split");
  assert.equal(isSignalWorkspaceActive(switched.viewMode, switched.chartConfig, "fft"), true);

  const closed = getSignalWorkspaceTransition(switched.viewMode, switched.chartConfig, "fft");
  assert.equal(closed.viewMode, "text");
  assert.equal(closed.chartConfig, switched.chartConfig);

  console.log("图表缓冲区通道推导检查通过");
} finally {
  await server.close();
}
