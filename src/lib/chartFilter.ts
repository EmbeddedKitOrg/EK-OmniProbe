import type { ChartDataPoint, DataFilterConfig, ParametricFilterStage } from "@/lib/chartTypes";

const MATLAB_NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

export function parseMatlabVector(text: string): number[] {
  return (text.match(MATLAB_NUMBER) ?? []).map(Number).filter(Number.isFinite);
}

export function parseMatlabSos(text: string): number[][] | null {
  const values = parseMatlabVector(text);
  if (values.length === 0 || values.length % 6 !== 0) return null;
  const sections: number[][] = [];
  for (let index = 0; index < values.length; index += 6) {
    const row = values.slice(index, index + 6);
    if (row[3] === 0) return null;
    sections.push(row);
  }
  return sections;
}

export function formatMatlabVector(values: number[]): string {
  return values.join(" ");
}

export function formatMatlabSos(sections: number[][]): string {
  return sections.map((row) => row.join(" ")).join(";\n");
}

export function isDataFilterReady(config: DataFilterConfig): boolean {
  if (!config.enabled) return false;
  if (config.kind === "fir") return config.firCoefficients.length > 0;
  if (config.kind === "cascade") {
    return designParametricSos(config.parametricStages, config.sampleRateHz) !== null;
  }
  if (config.kind === "sos") {
    return config.sosSections.length > 0 && Number.isFinite(config.scaleValues.reduce((a, b) => a * b, 1));
  }
  return config.medianWindowSize >= 3;
}

/** 把参数化二阶滤波器转换为与 MATLAB SOS 相同的 [b0,b1,b2,a0,a1,a2] 结构。 */
export function designParametricSos(stages: ParametricFilterStage[], sampleRateHz: number): number[][] | null {
  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0 || stages.length === 0) return null;
  const nyquist = sampleRateHz / 2;
  const sections: number[][] = [];

  for (const stage of stages) {
    if (
      !Number.isFinite(stage.frequencyHz) ||
      stage.frequencyHz <= 0 ||
      stage.frequencyHz >= nyquist ||
      !Number.isFinite(stage.q) ||
      stage.q <= 0
    ) {
      return null;
    }

    if (!stage.enabled) continue;

    const omega = (2 * Math.PI * stage.frequencyHz) / sampleRateHz;
    const cosine = Math.cos(omega);
    const alpha = Math.sin(omega) / (2 * stage.q);
    const a0 = 1 + alpha;
    const a1 = -2 * cosine;
    const a2 = 1 - alpha;

    if (stage.type === "highpass") {
      const b0 = (1 + cosine) / 2;
      sections.push([b0, -(1 + cosine), b0, a0, a1, a2]);
    } else if (stage.type === "bandpass") {
      sections.push([alpha, 0, -alpha, a0, a1, a2]);
    } else {
      const b0 = (1 - cosine) / 2;
      sections.push([b0, 1 - cosine, b0, a0, a1, a2]);
    }
  }

  return sections;
}

/** 计算 SOS 级联在对数频率轴上的幅频响应，用于配置预览。 */
export function calculateSosFrequencyResponse(
  sosSections: number[][],
  sampleRateHz: number,
  pointCount = 160
): Array<{ frequencyHz: number; magnitudeDb: number }> {
  if (sampleRateHz <= 0 || pointCount < 2) return [];
  const nyquist = sampleRateHz / 2;
  const minFrequency = Math.max(nyquist / 1000, 0.001);

  return Array.from({ length: pointCount }, (_, index) => {
    const ratio = index / (pointCount - 1);
    const frequencyHz = minFrequency * Math.pow(nyquist / minFrequency, ratio);
    const omega = (2 * Math.PI * frequencyHz) / sampleRateHz;
    let magnitude = 1;

    for (const [b0, b1, b2, a0, a1, a2] of sosSections) {
      const numeratorReal = b0 + b1 * Math.cos(omega) + b2 * Math.cos(2 * omega);
      const numeratorImag = -b1 * Math.sin(omega) - b2 * Math.sin(2 * omega);
      const denominatorReal = a0 + a1 * Math.cos(omega) + a2 * Math.cos(2 * omega);
      const denominatorImag = -a1 * Math.sin(omega) - a2 * Math.sin(2 * omega);
      magnitude *= Math.sqrt(
        (numeratorReal * numeratorReal + numeratorImag * numeratorImag) /
          (denominatorReal * denominatorReal + denominatorImag * denominatorImag)
      );
    }

    return { frequencyHz, magnitudeDb: Math.max(-80, Math.min(12, 20 * Math.log10(magnitude))) };
  });
}

/** 每通道一份有状态处理器（FIR 历史、median 窗口、SOS 的 z1/z2 都存在闭包里）。 */
export type ChannelProcessors = Map<string, (sample: number) => number>;

/**
 * 为每个通道各建一份处理器。返回值带内部状态，只能顺序喂样本；
 * 一旦通道集合或滤波配置变化就必须重建，否则滤波器状态与数据不匹配。
 */
export function createChannelProcessors(channelKeys: string[], config: DataFilterConfig): ChannelProcessors {
  const processors: ChannelProcessors = new Map();
  for (const key of channelKeys) processors.set(key, createProcessor(config));
  return processors;
}

/**
 * 把样本按顺序喂给已有处理器。会推进处理器内部状态，
 * 因此同一批数据不能重复调用。输入点不会被修改。
 */
export function runChannelProcessors(points: ChartDataPoint[], processors: ChannelProcessors): ChartDataPoint[] {
  if (points.length === 0 || processors.size === 0) return points;

  return points.map((point) => {
    let nextValues: Record<string, number> | null = null;
    for (const [key, process] of processors) {
      const value = point.values[key];
      if (!Number.isFinite(value)) continue;
      nextValues ??= { ...point.values };
      nextValues[key] = process(value);
    }
    return nextValues ? { ...point, values: nextValues } : point;
  });
}

/**
 * 从原始图表缓冲区一次性派生滤波结果（全量重算）。输入点不会被修改。
 * 增量场景请用 telemetry.ts 的 TelemetryFilterState，避免每帧重放整个缓冲区。
 */
export function applyDataFilter(
  points: ChartDataPoint[],
  channelKeys: string[],
  config: DataFilterConfig
): ChartDataPoint[] {
  if (points.length === 0 || channelKeys.length === 0 || !isDataFilterReady(config)) return points;
  return runChannelProcessors(points, createChannelProcessors(channelKeys, config));
}

/** 为图表、FFT 和后续分析模块统一生成原始/处理后数据。 */
export function resolveChartProcessing(points: ChartDataPoint[], channelKeys: string[], config: DataFilterConfig) {
  const filterActive = points.length > 0 && channelKeys.length > 0 && isDataFilterReady(config);
  return {
    processedData: filterActive ? applyDataFilter(points, channelKeys, config) : points,
    comparisonData: filterActive && config.showOriginal ? points : undefined,
    filterActive,
  };
}

function createProcessor(config: DataFilterConfig): (sample: number) => number {
  if (config.kind === "fir") {
    const coefficients = config.firCoefficients;
    const taps = coefficients.length;
    // 环形缓冲：原先用 unshift/pop，每个样本都要搬移整个 history 数组
    const history = new Float64Array(taps);
    let newest = 0; // 最新样本所在下标
    let filled = 0;
    return (sample) => {
      newest = newest === 0 ? taps - 1 : newest - 1;
      history[newest] = sample;
      if (filled < taps) filled += 1;
      let output = 0;
      for (let index = 0; index < filled; index += 1) {
        output += coefficients[index] * history[(newest + index) % taps];
      }
      return output;
    };
  }

  if (config.kind === "median") {
    const history: number[] = [];
    return (sample) => {
      history.push(sample);
      if (history.length > config.medianWindowSize) history.shift();
      const sorted = history.slice().sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
  }

  if (config.kind === "cascade") {
    return createSosProcessor(designParametricSos(config.parametricStages, config.sampleRateHz) ?? [], 1);
  }

  return createSosProcessor(
    config.sosSections,
    config.scaleValues.reduce((product, value) => product * value, 1)
  );
}

function createSosProcessor(sosSections: number[][], gain: number): (sample: number) => number {
  const sections = sosSections.map(([b0, b1, b2, a0, a1, a2]) => ({
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
    z1: 0,
    z2: 0,
  }));

  return (sample: number) => {
    let output = sample * gain;
    for (const section of sections) {
      const next = section.b0 * output + section.z1;
      section.z1 = section.b1 * output - section.a1 * next + section.z2;
      section.z2 = section.b2 * output - section.a2 * next;
      output = next;
    }
    return output;
  };
}
