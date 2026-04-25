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
