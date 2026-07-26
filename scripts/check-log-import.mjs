import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { detectLogFramePrefix, streamLogLines } = await server.ssrLoadModule("/src/lib/logImport.ts");
  const { populateEmptyChannelsFromSamples } = await server.ssrLoadModule("/src/lib/chartAnalysis.ts");
  const { DEFAULT_CHART_CONFIG } = await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { parseChartData } = await server.ssrLoadModule("/src/lib/parseChartData.ts");
  const { createSimulationSample } = await server.ssrLoadModule("/src/lib/serialSimulation.ts");
  await server.ssrLoadModule("/src/components/modes/LogAnalysisMode.tsx");
  const log = new Blob([
    "\uFEFF[20260724_13:18:19:567]P:1,2\r\n",
    "E:calendar month 7,0x7\r",
    "[20260724_13:18:20:001]\r\n",
  ]);
  const batches = [];
  const fallbackTimestamp = new Date(2026, 0, 1).getTime();

  assert.equal(detectLogFramePrefix("P:1,2"), "P:");
  assert.equal(detectLogFramePrefix("@PLOT:1,2"), "@PLOT:");
  assert.equal(detectLogFramePrefix("ordinary log text"), null);

  const simulationConfig = {
    preset: "waveform",
    sampleRateHz: 50,
    frequencyHz: 0.25,
    amplitude: 1,
    offset: 0,
    noise: 0,
    channelCount: 2,
    waveform: "sine",
    xyPattern: "circle",
  };
  const simulationSamples = Array.from({ length: 20 }, (_, index) => ({
    text: `SIM:${JSON.stringify(createSimulationSample(simulationConfig, index / simulationConfig.sampleRateHz))}`,
  }));
  const simulationChartConfig = populateEmptyChannelsFromSamples(
    { ...DEFAULT_CHART_CONFIG, parseMode: "auto", framePrefix: "SIM:", channels: [] },
    simulationSamples
  );
  assert.equal(detectLogFramePrefix(simulationSamples[0].text), "SIM:");
  assert.equal(simulationChartConfig.parseMode, "json");
  assert.deepEqual(
    simulationChartConfig.channels.map(({ key }) => key),
    ["ch1", "ch2"]
  );
  assert.deepEqual(
    parseChartData(simulationSamples[0].text, { ...simulationChartConfig, enabled: true }).dataPoint?.values,
    {
      ch1: 0,
      ch2: 1,
    }
  );

  for await (const batch of streamLogLines(log, { batchSize: 2, fallbackTimestamp })) {
    batches.push(batch);
  }

  assert.deepEqual(
    batches.map((batch) => batch.length),
    [2, 1]
  );
  const lines = batches.flat();
  const firstTimestamp = new Date(2026, 6, 24, 13, 18, 19, 567).getTime();
  assert.deepEqual(
    lines.map(({ lineNumber, text, timestamp, timestampInferred }) => ({
      lineNumber,
      text,
      timestamp,
      timestampInferred,
    })),
    [
      { lineNumber: 1, text: "P:1,2", timestamp: firstTimestamp, timestampInferred: false },
      { lineNumber: 2, text: "E:calendar month 7,0x7", timestamp: firstTimestamp, timestampInferred: true },
      {
        lineNumber: 3,
        text: "",
        timestamp: new Date(2026, 6, 24, 13, 18, 20, 1).getTime(),
        timestampInferred: false,
      },
    ]
  );

  console.log("日志流式导入检查通过");
} finally {
  await server.close();
}
