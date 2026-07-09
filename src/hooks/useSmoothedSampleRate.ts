import { useMemo, useRef } from "react";
import type { ChartDataPoint } from "@/lib/chartTypes";

const SMOOTHING_FACTOR = 0.15;

function estimateInstantSampleRate(chartData: ChartDataPoint[], windowSize: number) {
  if (chartData.length < 2) return null;
  const startIndex = Math.max(chartData.length - windowSize, 0);
  const first = chartData[startIndex].timestamp;
  const last = chartData[chartData.length - 1].timestamp;
  const count = chartData.length - startIndex - 1;
  const durationSec = (last - first) / 1000;
  if (durationSec <= 0 || count <= 0) return null;
  return count / durationSec;
}

// 串口/RTT 数据到达间隔本身有抖动，若每帧都直接采用瞬时估算的采样率，依赖该值的
// 横轴缩放（波形图）或徽标文字（工具栏）会跟着来回跳动。用 EMA 平滑；配置了固定
// 采样率时直接跳过估算。
export function useSmoothedSampleRate(chartData: ChartDataPoint[], configuredRateHz: number, windowSize = 100) {
  const smoothedRef = useRef<number | null>(null);

  return useMemo(() => {
    if (configuredRateHz > 0) {
      smoothedRef.current = configuredRateHz;
      return configuredRateHz;
    }
    const instant = estimateInstantSampleRate(chartData, windowSize);
    if (instant === null) return smoothedRef.current;
    const previous = smoothedRef.current;
    const smoothed = previous === null ? instant : previous + (instant - previous) * SMOOTHING_FACTOR;
    smoothedRef.current = smoothed;
    return smoothed;
  }, [chartData, configuredRateHz, windowSize]);
}
