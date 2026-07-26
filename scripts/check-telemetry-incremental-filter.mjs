// 增量滤波必须与全量重算逐点等价。
// 滤波器本身有状态（FIR 历史 / median 窗口 / SOS 的 z1z2），
// 所以「一次喂 N 个样本」和「分多批喂同样的 N 个样本」结果必须完全一致，
// 否则用户看到的波形会依赖数据到达的批次划分——那是随网络/串口时序漂移的。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { DEFAULT_DATA_FILTER_CONFIG } = await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { TelemetryFilterState, resolveTelemetryProcessing } = await server.ssrLoadModule("/src/lib/telemetry.ts");
  const { applyDataFilter } = await server.ssrLoadModule("/src/lib/chartFilter.ts");

  const channels = [{ key: "a", name: "a" }, { key: "b", name: "b" }];

  // 两路信号：一路正弦，一路带尖峰的方波（尖峰用来暴露 median 窗口的状态错误）
  const makeSamples = (count) =>
    Array.from({ length: count }, (_, i) => ({
      timestamp: 1000 + i * 10,
      values: {
        a: Math.sin(i / 7) * 3 + (i % 23 === 0 ? 12 : 0),
        b: (i % 16 < 8 ? 1 : -1) * 2 + Math.cos(i / 5),
      },
    }));

  const FILTERS = {
    fir: { ...DEFAULT_DATA_FILTER_CONFIG, enabled: true, kind: "fir", firCoefficients: [0.2, 0.3, 0.3, 0.2] },
    median: { ...DEFAULT_DATA_FILTER_CONFIG, enabled: true, kind: "median", medianWindowSize: 5 },
    sos: {
      ...DEFAULT_DATA_FILTER_CONFIG,
      enabled: true,
      kind: "sos",
      sosSections: [[0.2, 0.4, 0.2, 1, -0.3, 0.1]],
      scaleValues: [1],
    },
    cascade: {
      ...DEFAULT_DATA_FILTER_CONFIG,
      enabled: true,
      kind: "cascade",
      sampleRateHz: 100,
      parametricStages: [{ type: "lowpass", frequencyHz: 10, q: 0.707, gainDb: 0 }],
    },
  };

  // 分批方案：含 1 个样本的批、不等长批、以及正好压线的批
  const CHUNKINGS = [[1], [3], [7], [1, 2, 3, 5, 8, 13], [10, 1, 1, 1]];

  function feedInChunks(filterState, samples, chunkSizes, maxDataPoints, config) {
    let raw = [];
    let result = { rawData: [], processedData: [], filterActive: false };
    let cursor = 0;
    let sizeIndex = 0;
    while (cursor < samples.length) {
      const size = chunkSizes[sizeIndex % chunkSizes.length];
      const batch = samples.slice(cursor, cursor + size);
      cursor += size;
      sizeIndex += 1;
      result = filterState.append(raw, batch, maxDataPoints, channels, config);
      raw = result.rawData;
    }
    return result;
  }

  let cases = 0;

  for (const [name, config] of Object.entries(FILTERS)) {
    // 未触发裁剪：分批结果必须与一次性喂完、以及无状态全量重算三者完全一致
    {
      const samples = makeSamples(120);
      const maxDataPoints = 10_000;
      const oneShot = new TelemetryFilterState().append([], samples, maxDataPoints, channels, config);
      const stateless = resolveTelemetryProcessing(oneShot.rawData, channels, config);
      assert.deepEqual(
        oneShot.processedData,
        stateless.processedData,
        `${name}: 一次性喂完的结果与无状态全量重算不一致`
      );
      assert.equal(oneShot.filterActive, true, `${name}: filterActive 应为 true`);

      for (const chunkSizes of CHUNKINGS) {
        const incremental = feedInChunks(new TelemetryFilterState(), samples, chunkSizes, maxDataPoints, config);
        assert.deepEqual(incremental.rawData, oneShot.rawData, `${name}/chunks=${chunkSizes}: rawData 不一致`);
        assert.deepEqual(
          incremental.processedData,
          oneShot.processedData,
          `${name}/chunks=${chunkSizes}: 未裁剪时 processedData 必须与全量重算一致`
        );
        cases += 1;
      }
    }

    // 触发裁剪：语义是「滤波器状态对全部历史连续，再按窗口裁剪」。
    // 注意这与旧行为不同——旧实现每帧对裁剪后的窗口重新起算，
    // 导致滤波器预热瞬态永远停在可视窗口左边缘并随数据滚动反复出现。
    // 新语义下瞬态只在启动时出现一次，与真实的实时滤波器一致。
    {
      const samples = makeSamples(120);
      const maxDataPoints = 40;
      const continuous = applyDataFilter(
        samples.map((s) => ({ timestamp: s.timestamp, values: { ...s.values } })),
        ["a", "b"],
        config
      ).slice(-maxDataPoints);

      for (const chunkSizes of CHUNKINGS) {
        const incremental = feedInChunks(new TelemetryFilterState(), samples, chunkSizes, maxDataPoints, config);
        assert.equal(incremental.rawData.length, maxDataPoints, `${name}: rawData 应被裁剪到 maxDataPoints`);
        assert.equal(
          incremental.processedData.length,
          incremental.rawData.length,
          `${name}: processed 与 raw 长度必须对齐`
        );
        assert.deepEqual(
          incremental.processedData,
          continuous,
          `${name}/chunks=${chunkSizes}: 裁剪后应等于「连续滤波全部历史再裁剪」`
        );
        cases += 1;
      }
    }
  }

  // FIR 环形缓冲改写后，必须与朴素卷积实现一致
  {
    const coefficients = [0.1, -0.25, 0.5, 0.25, 0.4];
    const config = { ...DEFAULT_DATA_FILTER_CONFIG, enabled: true, kind: "fir", firCoefficients: coefficients };
    const samples = makeSamples(60);
    const filtered = applyDataFilter(
      samples.map((s) => ({ timestamp: s.timestamp, values: { ...s.values } })),
      ["a"],
      config
    );
    for (let i = 0; i < samples.length; i += 1) {
      let expected = 0;
      for (let tap = 0; tap < coefficients.length; tap += 1) {
        if (i - tap < 0) break;
        expected += coefficients[tap] * samples[i - tap].values.a;
      }
      assert.ok(
        Math.abs(filtered[i].values.a - expected) < 1e-9,
        `FIR 第 ${i} 点与朴素卷积不一致: ${filtered[i].values.a} vs ${expected}`
      );
    }
  }

  // 配置变化必须让处理器重建（否则新滤波器会继承旧状态）
  {
    const state = new TelemetryFilterState();
    const samples = makeSamples(50);
    const first = state.append([], samples, 10_000, channels, FILTERS.fir);
    const switched = state.append(first.rawData, makeSamples(10).slice(0, 10), 10_000, channels, FILTERS.median);
    const reference = resolveTelemetryProcessing(switched.rawData, channels, FILTERS.median);
    assert.deepEqual(switched.processedData, reference.processedData, "切换滤波类型后应全量重算");
  }

  // 关闭滤波后 processedData 应直接是原始数据
  {
    const state = new TelemetryFilterState();
    const samples = makeSamples(20);
    const off = state.append([], samples, 10_000, channels, DEFAULT_DATA_FILTER_CONFIG);
    assert.equal(off.filterActive, false);
    assert.equal(off.processedData, off.rawData, "未启用滤波时应复用原始数组");
  }

  // 外部替换缓冲区（例如 setChartConfig 走了无状态路径）后必须退回全量重算
  {
    const state = new TelemetryFilterState();
    const samples = makeSamples(40);
    const seeded = state.append([], samples, 10_000, channels, FILTERS.sos);
    const detached = seeded.rawData.slice(); // 新数组，引用不同
    const next = state.append(detached, makeSamples(5), 10_000, channels, FILTERS.sos);
    const reference = resolveTelemetryProcessing(next.rawData, channels, FILTERS.sos);
    assert.deepEqual(next.processedData, reference.processedData, "缓冲区被外部替换后应全量重算");
  }

  console.log(`增量滤波等价性检查通过（${cases} 组分批组合 + FIR 卷积对照 + 4 项边界）`);
} finally {
  await server.close();
}
