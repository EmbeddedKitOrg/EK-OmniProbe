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
 * 按 min/max 包络抽取下标。
 *
 * 等距抽取（downsampleIndices）会把落在采样点之间的尖峰整个丢掉：4000 点缩到 600 点时，
 * 毛刺、过冲、单点跳变直接消失，而这些往往正是用户打开波形要找的东西。更糟的是
 * 纵轴范围也是从抽样后的点算出来的，尖峰被丢掉会让纵轴一起缩小——用户看到的是
 * 一条"干净"的波形，且无从察觉自己看到的是失真结果。
 *
 * 包络抽取把区间切成若干桶，每个桶内保留每个通道的最小值点和最大值点，
 * 这样任何极值都不会被跳过。所有通道共享同一条 X 轴，因此保留的是下标的并集。
 *
 * 契约是「点数不超过 limit + 2，且极值必定保留」，而不是「正好返回 limit 个点」：
 * 每个桶最多产出 2 × channelCount 个下标，当桶内极值重合或跨桶重复时会更少。
 * limit 很小时（如 3）可能只产出首尾两点，这是每桶两点的固有代价。
 *
 * 桶数按 limit 反推（limit / (2 × channelCount)），通道越多横向时间分辨率越低
 * ——这是固定点数预算下的必然取舍。
 *
 * @param valueAt 取第 index 个样本在第 channel 路上的值；非有限值会被跳过
 * @param channelCount 参与包络的通道数（含用于对比显示的原始数据通道）
 */
export function downsampleEnvelopeIndices(
  start: number,
  count: number,
  limit: number,
  channelCount: number,
  valueAt: (index: number, channel: number) => number | undefined
): number[] {
  if (count <= 0) return [];
  if (limit <= 0 || count <= limit) return downsampleIndices(start, count, limit);
  // 没有通道信息时无从判断极值，退回等距抽取
  if (channelCount <= 0) return downsampleIndices(start, count, limit);

  const buckets = Math.max(1, Math.floor(limit / (2 * channelCount)));
  // 首尾始终保留，否则缩放/平移时波形两端会跳动
  const kept = new Set<number>([start, start + count - 1]);

  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const from = start + Math.floor((bucket * count) / buckets);
    const to = start + Math.floor(((bucket + 1) * count) / buckets); // 右开
    if (to <= from) continue;

    for (let channel = 0; channel < channelCount; channel += 1) {
      let minIndex = -1;
      let maxIndex = -1;
      let minValue = Number.POSITIVE_INFINITY;
      let maxValue = Number.NEGATIVE_INFINITY;

      for (let index = from; index < to; index += 1) {
        const value = valueAt(index, channel);
        if (value === undefined || !Number.isFinite(value)) continue;
        if (value < minValue) {
          minValue = value;
          minIndex = index;
        }
        if (value > maxValue) {
          maxValue = value;
          maxIndex = index;
        }
      }

      if (minIndex >= 0) kept.add(minIndex);
      if (maxIndex >= 0) kept.add(maxIndex);
    }
  }

  return [...kept].sort((a, b) => a - b);
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
