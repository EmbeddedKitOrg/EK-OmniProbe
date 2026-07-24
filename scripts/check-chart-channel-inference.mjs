import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { populateEmptyChannelsFromSamples } = await server.ssrLoadModule("/src/lib/chartAutoConfig.ts");
  const { DEFAULT_CHART_CONFIG, getSignalWorkspaceTransition, isSignalWorkspaceActive, migrateChartConfig } =
    await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { traceSignalPath } = await server.ssrLoadModule("/src/components/rtt/SignalPlotCanvas.tsx");

  assert.equal(DEFAULT_CHART_CONFIG.waveformInterpolation, "linear");
  assert.equal(migrateChartConfig({ waveformInterpolation: "smooth" }).waveformInterpolation, "smooth");
  assert.equal(migrateChartConfig({ waveformInterpolation: "invalid" }).waveformInterpolation, "linear");

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
