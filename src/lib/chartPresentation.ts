import type { ChartDataPoint, ChartSeries } from "./chartTypes";
import { downsamplePoints } from "./downsampling";

export type ChartDisplayRow = Record<string, number | string>;

export interface ChartStatistics {
  min: number;
  max: number;
  avg: number;
  latest: number;
}

export function buildChartDisplayRows(data: ChartDataPoint[], visiblePointLimit: number): ChartDisplayRow[] {
  if (data.length === 0) return [];
  const firstTimestamp = data[0].timestamp;
  const rows = data.map((point, index) => ({
    index,
    timestamp: point.timestamp,
    time: ((point.timestamp - firstTimestamp) / 1000).toFixed(3),
    ...point.values,
  }));
  return downsamplePoints(rows, visiblePointLimit > 0 ? visiblePointLimit : rows.length);
}

export function calculateChartStatistics(
  data: ChartDataPoint[],
  series: Array<Pick<ChartSeries, "key">>
): Record<string, ChartStatistics> | null {
  if (data.length === 0) return null;
  const statistics: Record<string, ChartStatistics> = {};

  for (const item of series) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let count = 0;
    let latest = 0;

    for (const point of data) {
      const value = point.values[item.key];
      if (!Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
      count += 1;
      latest = value;
    }

    if (count > 0) {
      statistics[item.key] = { min, max, avg: sum / count, latest };
    }
  }

  return statistics;
}

function nextPowerOfTwo(value: number) {
  let result = 1;
  while (result < value) result <<= 1;
  return result;
}

const windowCache = new Map<number, Float64Array>();

function getHannWindow(size: number): Float64Array {
  let cached = windowCache.get(size);
  if (cached) return cached;
  cached = new Float64Array(size);
  if (size === 1) {
    cached[0] = 1;
  } else {
    const factor = (2 * Math.PI) / (size - 1);
    for (let index = 0; index < size; index += 1) {
      cached[index] = 0.5 * (1 - Math.cos(factor * index));
    }
  }
  windowCache.set(size, cached);
  return cached;
}

let fftReBuffer = new Float64Array(0);
let fftImBuffer = new Float64Array(0);

function prepareFftBuffers(size: number) {
  if (fftReBuffer.length < size) {
    fftReBuffer = new Float64Array(size);
    fftImBuffer = new Float64Array(size);
    return;
  }
  fftReBuffer.fill(0, 0, size);
  fftImBuffer.fill(0, 0, size);
}

function fftInPlace(re: Float64Array, im: Float64Array, size: number) {
  let j = 0;
  for (let index = 1; index < size; index += 1) {
    let bit = size >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (index < j) {
      [re[index], re[j]] = [re[j], re[index]];
      [im[index], im[j]] = [im[j], im[index]];
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const half = length >> 1;
    const angle = (-2 * Math.PI) / length;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);

    for (let start = 0; start < size; start += length) {
      let weightRe = 1;
      let weightIm = 0;
      for (let offset = 0; offset < half; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + half;
        const oddRe = re[oddIndex] * weightRe - im[oddIndex] * weightIm;
        const oddIm = re[oddIndex] * weightIm + im[oddIndex] * weightRe;

        re[oddIndex] = re[evenIndex] - oddRe;
        im[oddIndex] = im[evenIndex] - oddIm;
        re[evenIndex] += oddRe;
        im[evenIndex] += oddIm;

        const nextWeightRe = weightRe * stepRe - weightIm * stepIm;
        weightIm = weightRe * stepIm + weightIm * stepRe;
        weightRe = nextWeightRe;
      }
    }
  }
}

export function calculateSpectrum(values: number[], sampleRateHz: number) {
  if (values.length === 0 || !Number.isFinite(sampleRateHz) || sampleRateHz <= 0) return [];
  const fftSize = nextPowerOfTwo(values.length);
  prepareFftBuffers(fftSize);
  const window = getHannWindow(values.length);

  for (let index = 0; index < values.length; index += 1) {
    fftReBuffer[index] = values[index] * window[index];
  }
  fftInPlace(fftReBuffer, fftImBuffer, fftSize);

  const result: Array<{ freq: number; magnitude: number }> = new Array(fftSize >> 1);
  const frequencyStep = sampleRateHz / fftSize;
  const amplitudeScale = 2 / fftSize;
  for (let bin = 0; bin < result.length; bin += 1) {
    const amplitude = amplitudeScale * Math.hypot(fftReBuffer[bin], fftImBuffer[bin]);
    result[bin] = {
      freq: bin * frequencyStep,
      magnitude: amplitude > 1e-12 ? 20 * Math.log10(amplitude) : -240,
    };
  }
  return result;
}
