import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from "react";
import {
  PRESET_COLORS,
  type ChartConfig,
  type ChartDataPoint,
  type ChartSeries,
  type SignalDomain,
  type WaveformInterpolation,
} from "@/lib/chartTypes";
import { cn } from "@/lib/utils";
import { downsamplePoints } from "@/lib/downsampling";
import { calculateSpectrum } from "@/lib/chartPresentation";
import { formatChartNumber } from "@/lib/formatters";
import { useSmoothedSampleRate } from "@/hooks/useSmoothedSampleRate";
import { Button } from "@/components/ui/button";
import { ScanLine } from "lucide-react";

interface SignalPlotCanvasProps {
  chartData: ChartDataPoint[];
  rawChartData?: ChartDataPoint[];
  filterActive?: boolean;
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
  rawValues?: Record<string, number>;
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

const getRawSeriesColor = (color: string) => {
  const index = PRESET_COLORS.indexOf(color);
  return index < 0 ? "#f97316" : PRESET_COLORS[(index + PRESET_COLORS.length / 2) % PRESET_COLORS.length];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface SignalPathPoint {
  x: number;
  y: number;
}

type SignalPathContext = Pick<CanvasRenderingContext2D, "moveTo" | "lineTo" | "bezierCurveTo">;

export function traceSignalPath(
  context: SignalPathContext,
  points: SignalPathPoint[],
  interpolation: WaveformInterpolation
) {
  if (points.length === 0) return;
  context.moveTo(points[0].x, points[0].y);

  if (interpolation === "linear" || points.length < 3) {
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    return;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(index - 1, 0)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(index + 2, points.length - 1)];
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);

    context.bezierCurveTo(
      current.x + (next.x - previous.x) / 6,
      clamp(current.y + (next.y - previous.y) / 6, minY, maxY),
      next.x - (following.x - current.x) / 6,
      clamp(next.y - (following.y - current.y) / 6, minY, maxY),
      next.x,
      next.y
    );
  }
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

export function SignalPlotCanvas({
  chartData,
  rawChartData,
  filterActive = false,
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

  const visibleSeries = useMemo(() => series.filter((item) => item.visible), [series]);

  // 串口/RTT 数据到达间隔本身有抖动，若每帧都直接采用瞬时估算值，波形横轴（index / 采样率）
  // 会跟着来回轻微缩放，看起来像“画面一直在抖”。用共享的 EMA 平滑 hook 处理。
  const effectiveSampleRate = useSmoothedSampleRate(chartData, chartConfig.sampleRateHz, 200);

  const normalizedData = useMemo<NormalizedPoint[]>(() => {
    if (chartData.length === 0) return [];
    const sampleRate = effectiveSampleRate && Number.isFinite(effectiveSampleRate) ? effectiveSampleRate : 1;

    return chartData.map((point, index) => ({
      index,
      timestamp: point.timestamp,
      // Waveform should use uniformly spaced samples instead of host receive timestamps.
      // Serial/RTT data often arrives in batches, which makes Date.now()-based X positions fold back.
      timeSec: index / sampleRate,
      values: point.values,
      rawValues: rawChartData?.[index]?.values,
    }));
  }, [chartData, effectiveSampleRate, rawChartData]);

  const timeView = useMemo<TimeViewModel | null>(() => {
    if (domain !== "time" || normalizedData.length === 0 || visibleSeries.length === 0) return null;

    const latestSec = normalizedData[normalizedData.length - 1].timeSec;
    const totalDurationSec = Math.max(latestSec, 0.001);
    const baseVisibleDurationSec = Math.max(totalDurationSec * 1.05, 0.05);
    const visibleDurationSec = clamp(
      baseVisibleDurationSec / timeZoom,
      0.0005,
      Math.max(baseVisibleDurationSec * 1.5, 0.05)
    );
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
        const rawValue = point.rawValues?.[item.key];
        if (Number.isFinite(rawValue)) {
          min = Math.min(min, rawValue as number);
          max = Math.max(max, rawValue as number);
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
  }, [chartConfig.visiblePointLimit, domain, normalizedData, timePanSec, timeZoom, visibleSeries, yOffset, yZoom]);

  const fftView = useMemo<FftViewModel | null>(() => {
    if (domain !== "fft" || normalizedData.length < 4 || visibleSeries.length === 0) return null;

    const windowSize = clamp(chartConfig.fftWindowSize || 1024, 32, 4096);
    const slice = normalizedData.slice(-windowSize);
    const durationSec = Math.max((slice[slice.length - 1].timestamp - slice[0].timestamp) / 1000, 0.001);
    const sampleRateHz = Math.max(effectiveSampleRate ?? Math.max((slice.length - 1) / durationSec, 1), 1);

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
          bins: calculateSpectrum(values, sampleRateHz),
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
    domain,
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
        interpolation: chartConfig.waveformInterpolation,
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
    chartConfig.waveformInterpolation,
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
      className={cn(
        "relative h-full min-h-[320px] overflow-hidden rounded-[28px] border border-border/60 bg-white/80",
        className
      )}
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
        <div className="pointer-events-none absolute left-4 right-28 top-4 flex flex-wrap gap-2">
          {visibleSeries.map((item) => {
            const latestValue = chartData[chartData.length - 1]?.values[item.key];
            const latestRawValue = rawChartData?.[rawChartData.length - 1]?.values[item.key];
            return (
              <div
                key={item.key}
                className="rounded-full border border-white/80 bg-white/88 px-3 py-1 text-[11px] shadow-sm backdrop-blur"
              >
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="font-medium text-foreground">{item.name}</span>
                {Number.isFinite(latestValue) && (
                  <span className="ml-2">
                    <span style={{ color: item.color }}>
                      {filterActive ? "滤 " : ""}
                      {formatChartNumber(latestValue as number)}
                    </span>
                    {rawChartData && Number.isFinite(latestRawValue) && (
                      <span style={{ color: getRawSeriesColor(item.color) }}>
                        {` · 原 ${formatChartNumber(latestRawValue as number)}`}
                      </span>
                    )}
                    <span className="text-muted-foreground">{item.unit ? ` ${item.unit}` : ""}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button
        size="sm"
        variant="outline"
        className="absolute right-3 top-3 z-10 h-8 gap-1 bg-white/90 shadow-sm backdrop-blur"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={handleReset}
        title="恢复 X/Y 自动范围"
        aria-label="自适应显示全部曲线"
      >
        <ScanLine className="h-3.5 w-3.5" />
        自适应
      </Button>

      <div className="pointer-events-none absolute bottom-3 left-4 rounded-full bg-secondary/85 px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
        左键拖拽平移，滚轮缩放 Y，Shift + 滚轮缩放 X，右键或“自适应”重置
      </div>

      {filterActive && (
        <div
          className={cn(
            "pointer-events-none absolute bottom-3 right-4 rounded-full px-3 py-1 text-[11px] shadow-sm",
            chartConfig.dataFilter.sampleRateHz > 0 &&
              effectiveSampleRate &&
              Math.abs(effectiveSampleRate - chartConfig.dataFilter.sampleRateHz) /
                chartConfig.dataFilter.sampleRateHz >
                0.05
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800"
          )}
        >
          {chartConfig.dataFilter.kind === "sos"
            ? "SOS"
            : chartConfig.dataFilter.kind === "fir"
              ? "FIR"
              : chartConfig.dataFilter.kind === "cascade"
                ? "参数级联"
                : "中值"}
          {chartConfig.dataFilter.sampleRateHz > 0 && effectiveSampleRate
            ? ` · 参数 ${chartConfig.dataFilter.sampleRateHz} Hz / 当前 ${effectiveSampleRate.toFixed(1)} Hz`
            : " · 滤波预览"}
        </div>
      )}
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
    interpolation: WaveformInterpolation;
    showGrid: boolean;
    showTooltip: boolean;
  }
) {
  const { size, plotWidth, plotHeight, timeView, hoverPoint, visibleSeries, interpolation, showGrid, showTooltip } =
    options;
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

  const drawSeries = (useRawValues: boolean) => {
    context.save();
    context.globalAlpha = useRawValues ? 0.8 : 1;
    context.lineWidth = useRawValues ? 1.5 : 2;
    context.setLineDash(useRawValues ? [5, 4] : []);
    for (const item of visibleSeries) {
      context.beginPath();
      context.strokeStyle = useRawValues ? getRawSeriesColor(item.color) : item.color;
      const pathPoints: SignalPathPoint[] = [];
      const flushPath = () => {
        traceSignalPath(context, pathPoints, interpolation);
        pathPoints.length = 0;
      };

      for (const point of points) {
        const value = useRawValues ? point.rawValues?.[item.key] : point.values[item.key];
        if (!Number.isFinite(value)) {
          flushPath();
          continue;
        }

        const x = MARGIN.left + ((point.timeSec - startSec) / (endSec - startSec || 1)) * plotWidth;
        const y = MARGIN.top + (1 - ((value as number) - yMin) / (yMax - yMin || 1)) * plotHeight;
        pathPoints.push({ x, y });
      }

      flushPath();
      context.stroke();
    }
    context.restore();
  };

  if (points.some((point) => point.rawValues)) drawSeries(true);
  drawSeries(false);

  if (
    showTooltip &&
    hoverPoint &&
    hoverPoint.x >= MARGIN.left &&
    hoverPoint.x <= size.width - MARGIN.right &&
    hoverPoint.y >= MARGIN.top &&
    hoverPoint.y <= size.height - MARGIN.bottom
  ) {
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
    drawTooltip(context, hoverPoint.x, hoverPoint.y, size, [
      `t = ${formatRelativeTime(nearestPoint.timeSec - latestSec, visibleDurationSec)}`,
      ...visibleSeries.map((item) => {
        const value = nearestPoint.values[item.key];
        const rawValue = nearestPoint.rawValues?.[item.key];
        const suffix = item.unit ? ` ${item.unit}` : "";
        return nearestPoint.rawValues
          ? `${item.name}: 滤 ${Number.isFinite(value) ? formatChartNumber(value) : "NaN"}${suffix} · 原 ${
              Number.isFinite(rawValue) ? formatChartNumber(rawValue as number) : "NaN"
            }${suffix}`
          : `${item.name}: ${Number.isFinite(value) ? formatChartNumber(value) : "NaN"}${suffix}`;
      }),
    ]);
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
      const y = MARGIN.top + (1 - (point.magnitude - yMin) / (yMax - yMin || 1)) * plotHeight;

      if (bin === startBin) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  }

  if (
    showTooltip &&
    hoverPoint &&
    hoverPoint.x >= MARGIN.left &&
    hoverPoint.x <= size.width - MARGIN.right &&
    hoverPoint.y >= MARGIN.top &&
    hoverPoint.y <= size.height - MARGIN.bottom
  ) {
    const ratio = (hoverPoint.x - MARGIN.left) / plotWidth;
    const hoverBin = clamp(Math.round(startBin + ratio * (endBin - startBin - 1)), startBin, endBin - 1);
    const freq = series[0]?.bins[hoverBin]?.freq ?? 0;

    drawHoverLine(context, hoverPoint.x, hoverPoint.y, plotWidth, plotHeight);
    drawTooltip(context, hoverPoint.x, hoverPoint.y, size, [
      `f = ${freq.toFixed(freqRange < 100 ? 2 : 0)} Hz`,
      ...series.map((item) => `${item.name}: ${item.bins[hoverBin]?.magnitude.toFixed(2) ?? "NaN"} dB`),
    ]);
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

function drawHoverLine(context: CanvasRenderingContext2D, x: number, y: number, plotWidth: number, plotHeight: number) {
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
