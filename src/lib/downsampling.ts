// src/lib/downsampling.ts
// 图表数据降采样工具

/**
 * 等距下采样：从 points 中均匀抽取至多 limit 个点。
 * - limit <= 0 或长度已不超过 limit 时原样返回。
 * - limit === 1 时仅返回最后一个点。
 */
export function downsamplePoints<T>(points: T[], limit: number): T[] {
  if (limit <= 0 || points.length <= limit) return points;
  if (limit === 1) return [points[points.length - 1]];
  const step = (points.length - 1) / (limit - 1);
  const sampled: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }
  return sampled;
}

/**
 * 波形横轴的 timeSec 严格等于 index / sampleRate，因此 [startSec, endSec]
 * 对应的必然是一段连续下标，可以直接算出来，不必扫描整个缓冲区去 filter。
 *
 * 先用乘法定位边界，再用实际的 index / sampleRate 校正浮点误差可能造成的
 * ±1 偏差（两个循环各自最多走一两步），保证与逐点比较 timeSec 的结果一致。
 * 若区间内没有任何点，返回整个缓冲区——与原先 filter 结果为空时的兜底一致。
 */
export function resolveTimeWindowIndices(
  pointCount: number,
  sampleRate: number,
  startSec: number,
  endSec: number
): { start: number; count: number } {
  if (pointCount <= 0) return { start: 0, count: 0 };

  const last = pointCount - 1;
  const clampIndex = (value: number) => Math.min(Math.max(value, 0), last);

  let startIndex = clampIndex(Math.ceil(startSec * sampleRate));
  while (startIndex > 0 && (startIndex - 1) / sampleRate >= startSec) startIndex -= 1;
  while (startIndex < last && startIndex / sampleRate < startSec) startIndex += 1;

  let endIndex = clampIndex(Math.floor(endSec * sampleRate));
  while (endIndex < last && (endIndex + 1) / sampleRate <= endSec) endIndex += 1;
  while (endIndex > 0 && endIndex / sampleRate > endSec) endIndex -= 1;

  const withinWindow = endIndex >= startIndex && startIndex / sampleRate >= startSec && endIndex / sampleRate <= endSec;

  return withinWindow ? { start: startIndex, count: endIndex - startIndex + 1 } : { start: 0, count: pointCount };
}

/**
 * 与 downsamplePoints 完全相同的等距抽取规则，但只返回下标。
 * 用于「先抽取、再按下标构造对象」的场景，避免为了抽取 600 个点
 * 先把整个 4000 点窗口物化出来。
 *
 * @param start 窗口在原数组中的起始下标
 * @param count 窗口长度
 */
export function downsampleIndices(start: number, count: number, limit: number): number[] {
  if (count <= 0) return [];
  if (limit <= 0 || count <= limit) {
    const all = new Array<number>(count);
    for (let index = 0; index < count; index += 1) all[index] = start + index;
    return all;
  }
  if (limit === 1) return [start + count - 1];
  const step = (count - 1) / (limit - 1);
  const indices = new Array<number>(limit);
  for (let index = 0; index < limit; index += 1) {
    indices[index] = start + Math.round(index * step);
  }
  return indices;
}
