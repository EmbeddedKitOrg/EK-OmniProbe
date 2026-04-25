import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from "react";
import type {
  ChartConfig,
  ChartDataPoint,
  ChartSeries,
  SignalDomain,
} from "@/lib/chartTypes";
import { cn } from "@/lib/utils";
import { downsamplePoints } from "@/lib/downsampling";
import { formatChartNumber } from "@/lib/formatters";

interface SignalPlotCanvasProps {
  chartData: ChartDataPoint[];
  series: ChartSeries[];
  chartConfig: ChartConfig;
  domain: SignalDomain;
  className?: string;
}

interface NormalizedPoint {
  index: number;
  timestamp: number;
  timeSec: number;
  values: Record<string, number>;
}

interface TimeViewModel {
  latestSec: number;
  baseVisibleDurationSec: number;
  visibleDurationSec: number;
  startSec: number;
  endSec: number;
  maxPanSec: number;
  points: NormalizedPoint[];
  yMin: number;
  yMax: number;
}

interface SpectrumSeries {
  key: string;
  name: string;
  color: string;
  bins: Array<{ freq: number; magnitude: number }>;
}

interface FftViewModel {
  sampleRateHz: number;
  visibleBinCount: number;
  maxPanBins: number;
  startBin: number;
  endBin: number;
  series: SpectrumSeries[];
  yMin: number;
  yMax: number;
}

const MARGIN = { top: 20, right: 20, bottom: 28, left: 60 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nextPowerOfTwo(value: number) {
  let result = 1;
  while (result < value) result <<= 1;
  return result;
}

function estimateSampleRate(chartData: ChartDataPoint[], configuredRate: number) {
  if (configuredRate > 0) {
    return configuredRate;
  }

  if (chartData.length < 2) {
    return null;
  }

  const startIndex = Math.max(chartData.length - 200, 0);
  const firstTimestamp = chartData[startIndex].timestamp;
  const lastTimestamp = chartData[chartData.length - 1].timestamp;
  const sampleCount = chartData.length - startIndex - 1;
  const durationSec = (lastTimestamp - firstTimestamp) / 1000;

  if (sampleCount <= 0 || durationSec <= 0) {
    return null;
  }

  return sampleCount / durationSec;
}

function formatRelativeTime(seconds: number, visibleDurationSec: number) {
  const absSec = Math.abs(seconds);
  if (visibleDurationSec < 0.01) {
    return `${(seconds * 1_000_000).toFixed(0)} us`;
  }
  if (visibleDurationSec < 3) {
    return `${(seconds * 1000).toFixed(1)} ms`;
  }
  if (absSec < 60) {
    return `${seconds.toFixed(2)} s`;
  }
  return `${(seconds / 60).toFixed(2)} min`;
}

// Hann 窗函数按 size 缓存，FFT 窗口尺寸通常只有少数几个固定值
const windowCache = new Map<number, Float64Array>();

function getHannWindow(size: number): Float64Array {
  let cached = windowCache.get(size);
  if (cached) return cached;
  cached = new Float64Array(size);
  if (size <= 1) {
    cached[0] = 1;
  } else {
    const factor = (2 * Math.PI) / (size - 1);
    for (let i = 0; i < size; i += 1) {
      cached[i] = 0.5 * (1 - Math.cos(factor * i));
    }
  }
  windowCache.set(size, cached);
  return cached;
}

// 跨调用复用的 FFT 缓冲区，按需扩容；computeSpectrum 在 useMemo 中串行调用
let fftReBuf: Float64Array = new Float64Array(0);
let fftImBuf: Float64Array = new Float64Array(0);

function ensureFftBuffers(size: number) {
  if (fftReBuf.length < size) {
    fftReBuf = new Float64Array(size);
    fftImBuf = new Float64Array(size);
  } else {
    fftReBuf.fill(0, 0, size);
    fftImBuf.fill(0, 0, size);
  }
}

function fftInPlace(re: Float64Array, im: Float64Array, size: number) {
  let j = 0;

  for (let i = 1; i < size; i += 1) {
    let bit = size >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  for (let len = 2; len <= size; len <<= 1) {
    const half = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wLenRe = Math.cos(angle);
    const wLenIm = Math.sin(angle);

    for (let i = 0; i < size; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const evenIndex = i + k;
        const oddIndex = evenIndex + half;
        const oddRe = re[oddIndex] * wRe - im[oddIndex] * wIm;
        const oddIm = re[oddIndex] * wIm + im[oddIndex] * wRe;

        re[oddIndex] = re[evenIndex] - oddRe;
        im[oddIndex] = im[evenIndex] - oddIm;
        re[evenIndex] += oddRe;
        im[evenIndex] += oddIm;

        const nextRe = wRe * wLenRe - wIm * wLenIm;
        wIm = wRe * wLenIm + wIm * wLenRe;
        wRe = nextRe;
      }
    }
  }
}

function computeSpectrum(values: number[], sampleRateHz: number) {
  const fftSize = nextPowerOfTwo(values.length);
  ensureFftBuffers(fftSize);
  const re = fftReBuf;
  const im = fftImBuf;
  const window = getHannWindow(values.length);

  for (let index = 0; index < values.length; index += 1) {
    re[index] = values[index] * window[index];
  }

  fftInPlace(re, im, fftSize);

  const half = fftSize >> 1;
  const result: Array<{ freq: number; magnitude: number }> = new Array(half);
  const freqStep = sampleRateHz / fftSize;
  const ampScale = 2 / fftSize;
  for (let bin = 0; bin < half; bin += 1) {
    const amplitude = ampScale * Math.hypot(re[bin], im[bin]);
    result[bin] = {
      freq: bin * freqStep,
      magnitude: amplitude > 1e-12 ? 20 * Math.log10(amplitude) : -240,
    };
  }
  return result;
}

export function SignalPlotCanvas({
  chartData,
  series,
  chartConfig,
  domain,
  className,
}: SignalPlotCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [timeZoom, setTimeZoom] = useState(1);
  const [timePanSec, setTimePanSec] = useState(0);
  const [fftZoom, setFftZoom] = useState(1);
  const [fftPanBins, setFftPanBins] = useState(0);
  const [yZoom, setYZoom] = useState(1);
  const [yOffset, setYOffset] = useState(0);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startPan: number;
    startFftPan: number;
    startYOffset: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startPan: 0,
    startFftPan: 0,
    startYOffset: 0,
  });

  const visibleSeries = useMemo(
    () => series.filter((item) => item.visible),
    [series]
  );

  const effectiveSampleRate = useMemo(
    () => estimateSampleRate(chartData, chartConfig.sampleRateHz),
    [chartConfig.sampleRateHz, chartData]
  );

  const normalizedData = useMemo<NormalizedPoint[]>(() => {
    if (chartData.length === 0) return [];
    const sampleRate = effectiveSampleRate && Number.isFinite(effectiveSampleRate)
      ? effectiveSampleRate
      : 1;

    return chartData.map((point, index) => ({
      index,
      timestamp: point.timestamp,
      // Waveform should use uniformly spaced samples instead of host receive timestamps.
      // Serial/RTT data often arrives in batches, which makes Date.now()-based X positions fold back.
      timeSec: index / sampleRate,
      values: point.values,
    }));
  }, [chartData, effectiveSampleRate]);

  const timeView = useMemo<TimeViewModel | null>(() => {
    if (normalizedData.length === 0 || visibleSeries.length === 0) return null;

    const latestSec = normalizedData[normalizedData.length - 1].timeSec;
    const totalDurationSec = Math.max(latestSec, 0.001);
    const baseVisibleDurationSec = Math.max(totalDurationSec * 1.05, 0.05);
    const visibleDurationSec = clamp(baseVisibleDurationSec / timeZoom, 0.0005, Math.max(baseVisibleDurationSec * 1.5, 0.05));
    const maxPanSec = Math.max(totalDurationSec - visibleDurationSec, 0);
    const clampedPanSec = clamp(timePanSec, 0, maxPanSec);
    const startSec = Math.max(latestSec - clampedPanSec - visibleDurationSec, 0);
    const endSec = startSec + visibleDurationSec;
    const points = normalizedData.filter((point) => point.timeSec >= startSec && point.timeSec <= endSec);
    const sourcePoints = points.length > 0 ? points : normalizedData;
    const sampledPoints = downsamplePoints(
      sourcePoints,
      chartConfig.visiblePointLimit > 0 ? chartConfig.visiblePointLimit : sourcePoints.length
    );

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const point of sampledPoints) {
      for (const item of visibleSeries) {
        const value = point.values[item.key];
        if (Number.isFinite(value)) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = -1;
      max = 1;
    }

    if (min === max) {
      const padding = Math.abs(min) * 0.15 || 1;
      min -= padding;
      max += padding;
    }

    const range = Math.max((max - min) * 1.12, 0.001) / yZoom;
    const center = (min + max) / 2 + yOffset;

    return {
      latestSec,
      baseVisibleDurationSec,
      visibleDurationSec,
      startSec,
      endSec,
      maxPanSec,
      points: sampledPoints,
      yMin: center - range / 2,
      yMax: center + range / 2,
    };
  }, [
    chartConfig.visiblePointLimit,
    normalizedData,
    timePanSec,
    timeZoom,
    visibleSeries,
    yOffset,
    yZoom,
  ]);

  const fftView = useMemo<FftViewModel | null>(() => {
    if (normalizedData.length < 4 || visibleSeries.length === 0) return null;

    const windowSize = clamp(chartConfig.fftWindowSize || 1024, 32, 4096);
    const slice = normalizedData.slice(-windowSize);
    const durationSec = Math.max(
      (slice[slice.length - 1].timestamp - slice[0].timestamp) / 1000,
      0.001
    );
    const sampleRateHz = Math.max(
      effectiveSampleRate ?? Math.max((slice.length - 1) / durationSec, 1),
      1
    );

    const computedSeries: SpectrumSeries[] = [];
    for (const item of visibleSeries) {
      const values = slice
        .map((point) => point.values[item.key])
        .filter((value): value is number => Number.isFinite(value));

      if (values.length >= 4) {
        computedSeries.push({
          key: item.key,
          name: item.name,
          color: item.color,
          bins: computeSpectrum(values, sampleRateHz),
        });
      }
    }

    if (computedSeries.length === 0) return null;

    const totalBins = computedSeries[0].bins.length;
    const clampedZoom = clamp(fftZoom, 1, 80);
    const visibleBinCount = clamp(Math.floor(totalBins / clampedZoom), 8, totalBins);
    const maxPanBins = Math.max(totalBins - visibleBinCount, 0);
    const startBin = clamp(Math.round(fftPanBins), 0, maxPanBins);
    const endBin = startBin + visibleBinCount;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const item of computedSeries) {
      for (let index = startBin; index < endBin; index += 1) {
        const magnitude = item.bins[index]?.magnitude;
        if (Number.isFinite(magnitude)) {
          min = Math.min(min, magnitude);
          max = Math.max(max, magnitude);
        }
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = -120;
      max = 0;
    }

    if (min === max) {
      min -= 5;
      max += 5;
    }

    const range = Math.max((max - min) * 1.1, 1) / yZoom;
    const center = (min + max) / 2 + yOffset;

    return {
      sampleRateHz,
      visibleBinCount,
      maxPanBins,
      startBin,
      endBin,
      series: computedSeries,
      yMin: center - range / 2,
      yMax: center + range / 2,
    };
  }, [
    chartConfig.fftWindowSize,
    effectiveSampleRate,
    fftPanBins,
    fftZoom,
    normalizedData,
    visibleSeries,
    yOffset,
    yZoom,
  ]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect.width ?? 0;
      const height = entry?.contentRect.height ?? 0;
      setSize({ width, height });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const plotWidth = Math.max(size.width - MARGIN.left - MARGIN.right, 1);
    const plotHeight = Math.max(size.height - MARGIN.top - MARGIN.bottom, 1);

    const background = context.createLinearGradient(0, 0, 0, size.height);
    background.addColorStop(0, "rgba(255,255,255,0.98)");
    background.addColorStop(1, "rgba(240,244,255,0.96)");
    context.fillStyle = background;
    context.fillRect(0, 0, size.width, size.height);

    context.strokeStyle = "rgba(90, 103, 136, 0.18)";
    context.lineWidth = 1;
    context.strokeRect(MARGIN.left, MARGIN.top, plotWidth, plotHeight);

    if (domain === "time" && timeView) {
      drawTimeChart(context, {
        size,
        plotWidth,
        plotHeight,
        timeView,
        hoverPoint,
        visibleSeries,
        showGrid: chartConfig.showGrid,
        showTooltip: chartConfig.showTooltip,
      });
    } else if (domain === "fft" && fftView) {
      drawFftChart(context, {
        size,
        plotWidth,
        plotHeight,
        fftView,
        hoverPoint,
        showGrid: chartConfig.showGrid,
        showTooltip: chartConfig.showTooltip,
      });
    } else {
      context.fillStyle = "rgba(102, 112, 133, 0.72)";
      context.font = "500 14px 'Segoe UI Variable', 'Noto Sans SC', sans-serif";
      context.textAlign = "center";
      context.fillText("等待足够的数据样本…", size.width / 2, size.height / 2);
    }
  }, [
    chartConfig.showGrid,
    chartConfig.showTooltip,
    domain,
    fftView,
    hoverPoint,
    size,
    timeView,
    visibleSeries,
  ]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.18 : 1 / 1.18;

    if (event.shiftKey) {
      if (domain === "time" && timeView) {
        const nextZoom = clamp(timeZoom * zoomFactor, 1, 120);
        setTimeZoom(nextZoom);
        if (nextZoom <= 1.02) {
          setTimePanSec(0);
        }
      } else if (domain === "fft" && fftView) {
        setFftZoom((value) => clamp(value * zoomFactor, 1, 80));
      }
      return;
    }

    setYZoom((value) => clamp(value * zoomFactor, 0.5, 80));
  };

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startPan: timePanSec,
      startFftPan: fftPanBins,
      startYOffset: yOffset,
    };
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setHoverPoint({ x, y });

    if (!dragStateRef.current.active) return;

    const plotWidth = Math.max(size.width - MARGIN.left - MARGIN.right, 1);
    const plotHeight = Math.max(size.height - MARGIN.top - MARGIN.bottom, 1);
    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;

    if (domain === "time" && timeView) {
      const deltaSec = (-dx / plotWidth) * timeView.visibleDurationSec;
      setTimePanSec(clamp(dragStateRef.current.startPan + deltaSec, 0, timeView.maxPanSec));
      setYOffset(dragStateRef.current.startYOffset + (dy / plotHeight) * (timeView.yMax - timeView.yMin));
    } else if (domain === "fft" && fftView) {
      const deltaBins = (-dx / plotWidth) * fftView.visibleBinCount;
      setFftPanBins(clamp(dragStateRef.current.startFftPan + deltaBins, 0, fftView.maxPanBins));
      setYOffset(dragStateRef.current.startYOffset + (dy / plotHeight) * (fftView.yMax - fftView.yMin));
    }
  };

  const handleMouseUp = () => {
    dragStateRef.current.active = false;
  };

  const handleReset = () => {
    setTimeZoom(1);
    setTimePanSec(0);
    setFftZoom(1);
    setFftPanBins(0);
    setYZoom(1);
    setYOffset(0);
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full min-h-[320px] overflow-hidden rounded-[28px] border border-border/60 bg-white/80", className)}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        dragStateRef.current.active = false;
        setHoverPoint(null);
      }}
      onMouseUp={handleMouseUp}
      onMouseOut={handleMouseUp}
      onContextMenu={(event) => {
        event.preventDefault();
        handleReset();
      }}
      role="presentation"
    >
      <canvas ref={canvasRef} className="h-full w-full cursor-crosshair" />

      {chartConfig.showLegend && (
        <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
          {visibleSeries.map((item) => {
            const latestValue = chartData[chartData.length - 1]?.values[item.key];
            return (
              <div
                key={item.key}
                className="rounded-full border border-white/80 bg-white/88 px-3 py-1 text-[11px] shadow-sm backdrop-blur"
              >
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="font-medium text-foreground">{item.name}</span>
                {Number.isFinite(latestValue) && (
                  <span className="ml-2 text-muted-foreground">{formatChartNumber(latestValue as number)}{item.unit ? ` ${item.unit}` : ""}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-4 rounded-full bg-secondary/85 px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
        左键拖拽平移，滚轮缩放 Y，Shift + 滚轮缩放 X，右键重置
      </div>
    </div>
  );
}

function drawTimeChart(
  context: CanvasRenderingContext2D,
  options: {
    size: { width: number; height: number };
    plotWidth: number;
    plotHeight: number;
    timeView: TimeViewModel;
    hoverPoint: { x: number; y: number } | null;
    visibleSeries: ChartSeries[];
    showGrid: boolean;
    showTooltip: boolean;
  }
) {
  const { size, plotWidth, plotHeight, timeView, hoverPoint, visibleSeries, showGrid, showTooltip } = options;
  const { latestSec, visibleDurationSec, startSec, endSec, points, yMin, yMax } = timeView;

  if (showGrid) {
    drawGrid(
      context,
      plotWidth,
      plotHeight,
      yMin,
      yMax,
      (value) => formatChartNumber(value),
      (ratio) => formatRelativeTime(startSec + ratio * visibleDurationSec - latestSec, visibleDurationSec)
    );
  }

  context.save();
  context.beginPath();
  context.rect(MARGIN.left, MARGIN.top, plotWidth, plotHeight);
  context.clip();

  for (const item of visibleSeries) {
    context.beginPath();
    context.strokeStyle = item.color;
    context.lineWidth = 2;
    let started = false;

    for (const point of points) {
      const value = point.values[item.key];
      if (!Number.isFinite(value)) {
        started = false;
        continue;
      }

      const x = MARGIN.left + ((point.timeSec - startSec) / (endSec - startSec || 1)) * plotWidth;
      const y = MARGIN.top + (1 - ((value - yMin) / (yMax - yMin || 1))) * plotHeight;

      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  }

  if (showTooltip && hoverPoint && hoverPoint.x >= MARGIN.left && hoverPoint.x <= size.width - MARGIN.right && hoverPoint.y >= MARGIN.top && hoverPoint.y <= size.height - MARGIN.bottom) {
    const hoverTimeSec = startSec + ((hoverPoint.x - MARGIN.left) / plotWidth) * visibleDurationSec;
    let nearestPoint = points[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const point of points) {
      const distance = Math.abs(point.timeSec - hoverTimeSec);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPoint = point;
      }
    }
    drawHoverLine(context, hoverPoint.x, hoverPoint.y, plotWidth, plotHeight);
    drawTooltip(
      context,
      hoverPoint.x,
      hoverPoint.y,
      size,
      [
        `t = ${formatRelativeTime(nearestPoint.timeSec - latestSec, visibleDurationSec)}`,
        ...visibleSeries.map((item) => {
          const value = nearestPoint.values[item.key];
          return `${item.name}: ${Number.isFinite(value) ? formatChartNumber(value) : "NaN"}${item.unit ? ` ${item.unit}` : ""}`;
        }),
      ]
    );
  }

  context.restore();
}

function drawFftChart(
  context: CanvasRenderingContext2D,
  options: {
    size: { width: number; height: number };
    plotWidth: number;
    plotHeight: number;
    fftView: FftViewModel;
    hoverPoint: { x: number; y: number } | null;
    showGrid: boolean;
    showTooltip: boolean;
  }
) {
  const { size, plotWidth, plotHeight, fftView, hoverPoint, showGrid, showTooltip } = options;
  const { startBin, endBin, sampleRateHz, series, yMin, yMax } = fftView;
  const firstFreq = series[0]?.bins[startBin]?.freq ?? 0;
  const lastFreq = series[0]?.bins[endBin - 1]?.freq ?? sampleRateHz / 2;
  const freqRange = Math.max(lastFreq - firstFreq, 1e-6);

  if (showGrid) {
    drawGrid(
      context,
      plotWidth,
      plotHeight,
      yMin,
      yMax,
      (value) => `${value.toFixed(1)} dB`,
      (ratio) => `${(firstFreq + ratio * freqRange).toFixed(freqRange < 100 ? 2 : 0)} Hz`
    );
  }

  context.save();
  context.beginPath();
  context.rect(MARGIN.left, MARGIN.top, plotWidth, plotHeight);
  context.clip();

  for (const item of series) {
    context.beginPath();
    context.strokeStyle = item.color;
    context.lineWidth = 2;

    for (let bin = startBin; bin < endBin; bin += 1) {
      const point = item.bins[bin];
      if (!point) continue;
      const x = MARGIN.left + ((point.freq - firstFreq) / freqRange) * plotWidth;
      const y = MARGIN.top + (1 - ((point.magnitude - yMin) / (yMax - yMin || 1))) * plotHeight;

      if (bin === startBin) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  }

  if (showTooltip && hoverPoint && hoverPoint.x >= MARGIN.left && hoverPoint.x <= size.width - MARGIN.right && hoverPoint.y >= MARGIN.top && hoverPoint.y <= size.height - MARGIN.bottom) {
    const ratio = (hoverPoint.x - MARGIN.left) / plotWidth;
    const hoverBin = clamp(Math.round(startBin + ratio * (endBin - startBin - 1)), startBin, endBin - 1);
    const freq = series[0]?.bins[hoverBin]?.freq ?? 0;

    drawHoverLine(context, hoverPoint.x, hoverPoint.y, plotWidth, plotHeight);
    drawTooltip(
      context,
      hoverPoint.x,
      hoverPoint.y,
      size,
      [
        `f = ${freq.toFixed(freqRange < 100 ? 2 : 0)} Hz`,
        ...series.map((item) => `${item.name}: ${item.bins[hoverBin]?.magnitude.toFixed(2) ?? "NaN"} dB`),
      ]
    );
  }

  context.restore();
}

function drawGrid(
  context: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  yMin: number,
  yMax: number,
  formatY: (value: number) => string,
  formatX: (ratio: number) => string
) {
  context.save();
  context.strokeStyle = "rgba(92, 104, 132, 0.12)";
  context.lineWidth = 1;
  context.setLineDash([4, 6]);
  context.fillStyle = "rgba(94, 104, 121, 0.84)";
  context.font = "12px 'Segoe UI Variable', 'Noto Sans SC', sans-serif";

  const verticalSteps = 6;
  for (let step = 0; step <= verticalSteps; step += 1) {
    const ratio = step / verticalSteps;
    const x = MARGIN.left + ratio * plotWidth;
    context.beginPath();
    context.moveTo(x, MARGIN.top);
    context.lineTo(x, MARGIN.top + plotHeight);
    context.stroke();
    context.textAlign = "center";
    context.fillText(formatX(ratio), x, MARGIN.top + plotHeight + 18);
  }

  const horizontalSteps = 5;
  for (let step = 0; step <= horizontalSteps; step += 1) {
    const ratio = step / horizontalSteps;
    const y = MARGIN.top + ratio * plotHeight;
    const value = yMax - ratio * (yMax - yMin);
    context.beginPath();
    context.moveTo(MARGIN.left, y);
    context.lineTo(MARGIN.left + plotWidth, y);
    context.stroke();
    context.textAlign = "right";
    context.fillText(formatY(value), MARGIN.left - 8, y + 4);
  }

  context.setLineDash([]);
  context.restore();
}

function drawHoverLine(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  plotWidth: number,
  plotHeight: number
) {
  context.save();
  context.strokeStyle = "rgba(28, 27, 31, 0.28)";
  context.lineWidth = 1;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(x, MARGIN.top);
  context.lineTo(x, MARGIN.top + plotHeight);
  context.moveTo(MARGIN.left, y);
  context.lineTo(MARGIN.left + plotWidth, y);
  context.stroke();
  context.setLineDash([]);
  context.restore();
}

function drawTooltip(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: { width: number; height: number },
  lines: string[]
) {
  context.save();
  context.font = "12px 'Segoe UI Variable', 'Noto Sans SC', sans-serif";
  const padding = 10;
  const lineHeight = 18;
  const width = Math.max(...lines.map((line) => context.measureText(line).width)) + padding * 2;
  const height = lines.length * lineHeight + padding * 2;
  const drawX = clamp(x + 16, MARGIN.left + 8, Math.max(size.width - width - 8, MARGIN.left + 8));
  const drawY = clamp(y - height - 12, MARGIN.top + 8, Math.max(size.height - height - 8, MARGIN.top + 8));

  context.fillStyle = "rgba(250, 250, 255, 0.96)";
  context.strokeStyle = "rgba(128, 140, 168, 0.3)";
  context.lineWidth = 1;
  roundRect(context, drawX, drawY, width, height, 16);
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(38, 45, 64, 0.95)";
  context.textAlign = "left";
  lines.forEach((line, index) => {
    context.fillText(line, drawX + padding, drawY + padding + 13 + index * lineHeight);
  });
  context.restore();
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + clampedRadius, y);
  context.arcTo(x + width, y, x + width, y + height, clampedRadius);
  context.arcTo(x + width, y + height, x, y + height, clampedRadius);
  context.arcTo(x, y + height, x, y, clampedRadius);
  context.arcTo(x, y, x + width, y, clampedRadius);
  context.closePath();
}
