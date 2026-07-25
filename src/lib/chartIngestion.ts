import type { ChartDataPoint, TelemetryConfig } from "./chartTypes";
import { appendTelemetrySamples, type TelemetryBatch } from "./telemetry";
import { parseChartLines, type ChartInputLine } from "./parseChartData";

export function appendChartData(
  current: ChartDataPoint[],
  incoming: ChartDataPoint[],
  maxDataPoints: number
): ChartDataPoint[] {
  return appendTelemetrySamples(current, incoming, maxDataPoints);
}

export class TelemetryIngestionBuffer {
  private points: ChartDataPoint[] = [];
  private success = 0;
  private fail = 0;

  constructor(private readonly maxDataPoints = Number.POSITIVE_INFINITY) {}

  ingestLines(lines: ChartInputLine[], config: TelemetryConfig): void {
    this.ingestBatch(parseChartLines(lines, config));
  }

  ingestBatch(batch: TelemetryBatch): void {
    this.points.push(...batch.points);
    if (this.points.length > this.maxDataPoints) {
      this.points.splice(0, this.points.length - this.maxDataPoints);
    }
    this.success += batch.success;
    this.fail += batch.fail;
  }

  drain(): TelemetryBatch {
    const batch = { points: this.points, success: this.success, fail: this.fail };
    this.points = [];
    this.success = 0;
    this.fail = 0;
    return batch;
  }
}

export { TelemetryIngestionBuffer as ChartIngestionBuffer };
