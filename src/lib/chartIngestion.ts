import type { ChartConfig, ChartDataPoint } from "./chartTypes";
import { parseChartLines, type ChartInputLine, type ChartParseBatch } from "./parseChartData";

export function appendChartData(
  current: ChartDataPoint[],
  incoming: ChartDataPoint[],
  maxDataPoints: number
): ChartDataPoint[] {
  if (incoming.length === 0) return current;
  if (maxDataPoints <= 0) return [];

  const merged = current.concat(incoming);
  return merged.length > maxDataPoints ? merged.slice(-maxDataPoints) : merged;
}

export class ChartIngestionBuffer {
  private points: ChartDataPoint[] = [];
  private success = 0;
  private fail = 0;

  constructor(private readonly maxDataPoints = Number.POSITIVE_INFINITY) {}

  ingestLines(lines: ChartInputLine[], config: ChartConfig): void {
    this.ingestBatch(parseChartLines(lines, config));
  }

  ingestBatch(batch: ChartParseBatch): void {
    this.points.push(...batch.points);
    if (this.points.length > this.maxDataPoints) {
      this.points.splice(0, this.points.length - this.maxDataPoints);
    }
    this.success += batch.success;
    this.fail += batch.fail;
  }

  drain(): ChartParseBatch {
    const batch = { points: this.points, success: this.success, fail: this.fail };
    this.points = [];
    this.success = 0;
    this.fail = 0;
    return batch;
  }
}
