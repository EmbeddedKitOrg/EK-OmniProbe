// 波形可见窗口的下标计算必须与「先物化全部点再 filter」的旧做法完全等价。
// SignalPlotCanvas 现在只为抽样后的点构造对象，如果窗口边界算错，
// 用户会看到波形左右边缘莫名多出或缺失一段。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { downsamplePoints, downsampleIndices, resolveTimeWindowIndices } =
    await server.ssrLoadModule("/src/lib/downsampling.ts");

  // 1) downsampleIndices 必须与 downsamplePoints 抽取到完全相同的元素
  {
    let checked = 0;
    for (const count of [0, 1, 2, 3, 5, 17, 100, 601, 4000]) {
      const points = Array.from({ length: count }, (_, i) => ({ i }));
      for (const limit of [0, 1, 2, 3, 7, 600, count - 1, count, count + 1]) {
        if (limit < 0) continue;
        const byValue = downsamplePoints(points, limit);
        const byIndex = downsampleIndices(0, count, limit).map((index) => points[index]);
        assert.deepEqual(byIndex, byValue, `count=${count} limit=${limit}: 抽取结果不一致`);
        checked += 1;
      }
    }
    console.log(`  downsampleIndices 与 downsamplePoints 一致（${checked} 组）`);
  }

  // 2) 带偏移的窗口抽取
  {
    const points = Array.from({ length: 500 }, (_, i) => ({ i }));
    for (const [start, count] of [
      [0, 500],
      [10, 1],
      [123, 45],
      [400, 100],
      [499, 1],
    ]) {
      const window = points.slice(start, start + count);
      for (const limit of [1, 7, 600, count]) {
        const byValue = downsamplePoints(window, limit);
        const byIndex = downsampleIndices(start, count, limit).map((index) => points[index]);
        assert.deepEqual(byIndex, byValue, `start=${start} count=${count} limit=${limit}: 窗口抽取不一致`);
      }
    }
    console.log("  带偏移的窗口抽取一致");
  }

  // 3) resolveTimeWindowIndices 必须与逐点比较 timeSec 的 filter 等价
  {
    let checked = 0;
    for (const pointCount of [1, 2, 9, 137, 4000]) {
      for (const sampleRate of [1, 3, 200, 1000, 44100, 0.5]) {
        const total = (pointCount - 1) / sampleRate;
        const windows = [
          [0, total],
          [0, total / 2],
          [total / 3, (total * 2) / 3],
          [total / 2, total],
          [total, total],
          [-1, total + 1],
          [total * 0.9, total * 0.95],
          [total + 1, total + 2], // 完全越界：应退回整个缓冲区
        ];
        for (const [startSec, endSec] of windows) {
          // 旧做法：物化全部点再 filter，空则退回全部
          const all = Array.from({ length: pointCount }, (_, index) => ({
            index,
            timeSec: index / sampleRate,
          }));
          const filtered = all.filter((p) => p.timeSec >= startSec && p.timeSec <= endSec);
          const expected = filtered.length > 0 ? filtered : all;

          const { start, count } = resolveTimeWindowIndices(pointCount, sampleRate, startSec, endSec);
          const actual = Array.from({ length: count }, (_, i) => all[start + i]);

          assert.deepEqual(
            actual.map((p) => p.index),
            expected.map((p) => p.index),
            `n=${pointCount} fs=${sampleRate} [${startSec}, ${endSec}]: 窗口下标与 filter 不一致`
          );
          checked += 1;
        }
      }
    }
    console.log(`  时间窗口下标与 filter 等价（${checked} 组）`);
  }

  // 4) 空缓冲区
  assert.deepEqual(resolveTimeWindowIndices(0, 100, 0, 1), { start: 0, count: 0 });

  console.log("波形可见窗口下标检查通过");
} finally {
  await server.close();
}
