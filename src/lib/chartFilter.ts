import type { ChartDataPoint, DataFilterConfig } from "@/lib/chartTypes";

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
  if (config.kind === "sos") {
    return config.sosSections.length > 0 && Number.isFinite(config.scaleValues.reduce((a, b) => a * b, 1));
  }
  return config.medianWindowSize >= 3;
}

/**
 * 从原始图表缓冲区派生滤波结果。输入点不会被修改，因此日志、导出和其他消费者仍使用原始数据。
 */
export function applyDataFilter(
  points: ChartDataPoint[],
  channelKeys: string[],
  config: DataFilterConfig
): ChartDataPoint[] {
  if (points.length === 0 || channelKeys.length === 0 || !isDataFilterReady(config)) return points;

  const processors = new Map<string, (sample: number) => number>();
  for (const key of channelKeys) processors.set(key, createProcessor(config));

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

function createProcessor(config: DataFilterConfig): (sample: number) => number {
  if (config.kind === "fir") {
    const coefficients = config.firCoefficients;
    const history: number[] = [];
    return (sample) => {
      history.unshift(sample);
      if (history.length > coefficients.length) history.pop();
      let output = 0;
      for (let index = 0; index < history.length; index += 1) output += coefficients[index] * history[index];
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

  const gain = config.scaleValues.reduce((product, value) => product * value, 1);
  const sections = config.sosSections.map(([b0, b1, b2, a0, a1, a2]) => ({
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
    z1: 0,
    z2: 0,
  }));

  return (sample) => {
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
