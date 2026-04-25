import { useMemo, useState } from "react";
import type { ChartConfig, ChartDataPoint, ChartSeries, SignalDomain } from "@/lib/chartTypes";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Download, Info, Pause, Play, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { downsamplePoints } from "@/lib/downsampling";
import { formatChartNumber } from "@/lib/formatters";
import { SignalPlotCanvas } from "./SignalPlotCanvas";

interface BrushDomain {
  startIndex?: number;
  endIndex?: number;
}

interface SeriesSnapshot {
  key: string;
  name: string;
  color: string;
  latest: number;
}

interface SeriesInspectorEntry {
  key: string;
  name: string;
  color: string;
  visible: boolean;
  unit?: string;
  latestValue: number | null;
  configured: boolean;
}

function fallbackSeriesColor(index: number) {
  return `hsl(${(index * 53) % 360} 72% 48%)`;
}

export interface ChartViewerProps {
  chartData: ChartDataPoint[];
  chartConfig: ChartConfig;
  chartPaused: boolean;
  parseSuccessCount: number;
  parseFailCount: number;
  setChartPaused: (paused: boolean) => void;
  clearChartData: () => void;
  setChartConfig: (config: ChartConfig) => void;
}

export function ChartViewer({
  chartData,
  chartConfig,
  chartPaused,
  parseSuccessCount,
  parseFailCount,
  setChartPaused,
  clearChartData,
  setChartConfig,
}: ChartViewerProps) {
  const [zoomDomain, setZoomDomain] = useState<BrushDomain>({});
  const signalDomain = chartConfig.signalDomain ?? "time";
  const latestPoint = chartData[chartData.length - 1];

  const chartDataFormatted = useMemo(() => {
    if (chartData.length === 0) return [];
    const firstTimestamp = chartData[0].timestamp;
    const formatted = chartData.map((point, index) => ({
      index,
      timestamp: point.timestamp,
      time: ((point.timestamp - firstTimestamp) / 1000).toFixed(3),
      ...point.values,
    }));
    return downsamplePoints(
      formatted,
      chartConfig.visiblePointLimit > 0 ? chartConfig.visiblePointLimit : formatted.length
    );
  }, [chartConfig.visiblePointLimit, chartData]);

  const visibleSeries = useMemo(
    () => chartConfig.series.filter((item) => item.visible),
    [chartConfig.series]
  );

  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    chartData.forEach((point) => {
      Object.entries(point.values).forEach(([key, value]) => {
        if (chartConfig.chartType === "xy-scatter" && key === chartConfig.xAxisField) return;
        if (typeof value === "number" && Number.isFinite(value)) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      });
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 100];
    if (min === max) {
      const padding = Math.abs(min) * 0.1 || 10;
      return [min - padding, max + padding];
    }
    const margin = (max - min) * 0.1;
    return [min - margin, max + margin];
  }, [chartConfig.chartType, chartConfig.xAxisField, chartData]);

  const xAxisDomain = useMemo(() => {
    if (chartConfig.chartType !== "xy-scatter" || !chartConfig.xAxisField) return undefined;
    if (chartData.length === 0) return [0, 100];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    chartData.forEach((point) => {
      const value = point.values[chartConfig.xAxisField!];
      if (typeof value === "number" && Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 100];
    if (min === max) {
      const padding = Math.abs(min) * 0.1 || 10;
      return [min - padding, max + padding];
    }
    const margin = (max - min) * 0.1;
    return [min - margin, max + margin];
  }, [chartConfig.chartType, chartConfig.xAxisField, chartData]);

  const statistics = useMemo(() => {
    if (chartData.length === 0) return null;
    const stats: Record<string, { min: number; max: number; avg: number; latest: number }> = {};
    visibleSeries.forEach((series) => {
      const values = chartData
        .map((point) => point.values[series.key])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      if (values.length > 0) {
        stats[series.key] = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((sum, value) => sum + value, 0) / values.length,
          latest: values[values.length - 1],
        };
      }
    });
    return stats;
  }, [chartData, visibleSeries]);

  const estimatedSampleRate = useMemo(() => {
    if (chartConfig.sampleRateHz > 0) return chartConfig.sampleRateHz;
    if (chartData.length < 2) return null;
    const startIndex = Math.max(chartData.length - 100, 0);
    const first = chartData[startIndex].timestamp;
    const last = chartData[chartData.length - 1].timestamp;
    const count = chartData.length - startIndex - 1;
    const durationSec = (last - first) / 1000;
    if (durationSec <= 0 || count <= 0) return null;
    return count / durationSec;
  }, [chartConfig.sampleRateHz, chartData]);

  const parseHealth = useMemo(() => {
    const total = parseSuccessCount + parseFailCount;
    if (total === 0) return null;
    return (parseSuccessCount / total) * 100;
  }, [parseFailCount, parseSuccessCount]);

  const latestSeriesSnapshot = useMemo<SeriesSnapshot[]>(() => {
    if (!statistics) return [];
    return visibleSeries
      .map((series) => {
        const stat = statistics[series.key];
        if (!stat) return null;
        return {
          key: series.key,
          name: series.name,
          color: series.color,
          latest: stat.latest,
        };
      })
      .filter((item): item is SeriesSnapshot => item !== null)
      .slice(0, 4);
  }, [statistics, visibleSeries]);

  const seriesInspectorEntries = useMemo<SeriesInspectorEntry[]>(() => {
    const keys = new Set<string>();
    chartConfig.series.forEach((series) => keys.add(series.key));
    if (latestPoint) {
      Object.keys(latestPoint.values).forEach((key) => keys.add(key));
    }
    const seriesMap = new Map(chartConfig.series.map((series) => [series.key, series]));
    return Array.from(keys)
      .map((key, index) => {
        const series = seriesMap.get(key);
        const rawValue = latestPoint?.values[key];
        return {
          key,
          name: series?.name ?? key,
          color: series?.color ?? fallbackSeriesColor(index),
          visible: series?.visible ?? false,
          unit: series?.unit ?? "",
          latestValue:
            typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null,
          configured: Boolean(series),
        };
      })
      .sort((left, right) => {
        if (left.configured !== right.configured) {
          return Number(right.configured) - Number(left.configured);
        }
        if (left.visible !== right.visible) {
          return Number(right.visible) - Number(left.visible);
        }
        return left.key.localeCompare(right.key);
      });
  }, [chartConfig.series, latestPoint]);

  const updateSignalDomain = (domain: SignalDomain) => {
    setChartConfig({
      ...chartConfig,
      chartType: "waveform",
      signalDomain: domain,
    });
  };

  const handleExport = () => {
    if (chartData.length === 0) return;
    const headers = ["时间戳", "相对时间(s)"];
    const keys = chartData.length > 0 ? Object.keys(chartData[0].values) : [];
    headers.push(...keys);
    const firstTimestamp = chartData[0].timestamp;
    const rows = chartData.map((point) => {
      const relativeTime = ((point.timestamp - firstTimestamp) / 1000).toFixed(6);
      return [
        point.timestamp.toString(),
        relativeTime,
        ...keys.map((key) => (point.values[key] ?? "").toString()),
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `chart-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleClearSeries = () => {
    clearChartData();
    setChartConfig({
      ...chartConfig,
      series: [],
    });
  };

  const updateSeriesConfig = (
    seriesKey: string,
    updater: (series: ChartSeries) => ChartSeries
  ) => {
    setChartConfig({
      ...chartConfig,
      series: chartConfig.series.map((series) =>
        series.key === seriesKey ? updater(series) : series
      ),
    });
  };

  const addSeriesFromField = (
    entry: SeriesInspectorEntry,
    overrides: Partial<ChartSeries> = {}
  ) => {
    const existingSeries = chartConfig.series.find((series) => series.key === entry.key);
    if (existingSeries) {
      if (Object.keys(overrides).length === 0) return;
      setChartConfig({
        ...chartConfig,
        series: chartConfig.series.map((series) =>
          series.key === entry.key ? { ...series, ...overrides } : series
        ),
      });
      return;
    }

    setChartConfig({
      ...chartConfig,
      series: [
        ...chartConfig.series,
        {
          key: entry.key,
          name: entry.name,
          color: entry.color,
          visible: true,
          unit: entry.unit,
          ...overrides,
        },
      ],
    });
  };

  const updateNumericConfig = (
    key: "maxDataPoints" | "visiblePointLimit" | "sampleRateHz",
    rawValue: string
  ) => {
    if (key === "sampleRateHz") {
      setChartConfig({
        ...chartConfig,
        sampleRateHz: Math.max(Number.parseFloat(rawValue) || 0, 0),
      });
      return;
    }

    if (key === "visiblePointLimit") {
      setChartConfig({
        ...chartConfig,
        visiblePointLimit: Math.max(Number.parseInt(rawValue, 10) || 0, 0),
      });
      return;
    }

    setChartConfig({
      ...chartConfig,
      maxDataPoints: Math.max(Number.parseInt(rawValue, 10) || 0, 100),
    });
  };

  const renderBusinessChart = () => {
    if (chartConfig.chartType === "line") {
      return (
        <LineChart data={chartDataFormatted}>
          {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
          <XAxis dataKey="time" tick={{ fontSize: 12 }} label={{ value: "时间 (s)", position: "insideBottom", offset: -5 }} />
          <YAxis tick={{ fontSize: 12 }} domain={yAxisDomain} label={{ value: "数值", angle: -90, position: "insideLeft" }} />
          {chartConfig.showTooltip && <Tooltip />}
          {chartConfig.showLegend && <Legend />}
          <Brush dataKey="index" height={28} stroke="#5f82ff" startIndex={zoomDomain.startIndex} endIndex={zoomDomain.endIndex} onChange={(domain) => setZoomDomain(domain || {})} />
          {visibleSeries.map((series) => (
            <Line key={series.key} type="monotone" dataKey={series.key} stroke={series.color} name={series.name} dot={false} strokeWidth={2} isAnimationActive={chartConfig.animationEnabled} />
          ))}
        </LineChart>
      );
    }

    if (chartConfig.chartType === "bar") {
      return (
        <BarChart data={chartDataFormatted}>
          {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
          <XAxis dataKey="time" tick={{ fontSize: 12 }} label={{ value: "时间 (s)", position: "insideBottom", offset: -5 }} />
          <YAxis tick={{ fontSize: 12 }} domain={yAxisDomain} label={{ value: "数值", angle: -90, position: "insideLeft" }} />
          {chartConfig.showTooltip && <Tooltip />}
          {chartConfig.showLegend && <Legend />}
          <Brush dataKey="index" height={28} stroke="#5f82ff" startIndex={zoomDomain.startIndex} endIndex={zoomDomain.endIndex} onChange={(domain) => setZoomDomain(domain || {})} />
          {visibleSeries.map((series) => (
            <Bar key={series.key} dataKey={series.key} fill={series.color} name={series.name} isAnimationActive={chartConfig.animationEnabled} />
          ))}
        </BarChart>
      );
    }

    if (chartConfig.chartType === "xy-scatter") {
      return (
        <ScatterChart data={chartDataFormatted}>
          {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
          <XAxis type="number" dataKey={chartConfig.xAxisField || "index"} domain={xAxisDomain || ["auto", "auto"]} tick={{ fontSize: 12 }} label={{ value: chartConfig.xAxisField || "X", position: "insideBottom", offset: -5 }} />
          <YAxis type="number" tick={{ fontSize: 12 }} domain={yAxisDomain} label={{ value: "Y", angle: -90, position: "insideLeft" }} />
          {chartConfig.showTooltip && <Tooltip />}
          {chartConfig.showLegend && <Legend />}
          <Brush dataKey="index" height={28} stroke="#5f82ff" startIndex={zoomDomain.startIndex} endIndex={zoomDomain.endIndex} onChange={(domain) => setZoomDomain(domain || {})} />
          {visibleSeries.map((series) => (
            <Scatter key={series.key} dataKey={series.key} fill={series.color} name={series.name} isAnimationActive={chartConfig.animationEnabled} />
          ))}
        </ScatterChart>
      );
    }

    return (
      <ScatterChart data={chartDataFormatted}>
        {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
        <XAxis dataKey="time" tick={{ fontSize: 12 }} label={{ value: "时间 (s)", position: "insideBottom", offset: -5 }} />
        <YAxis tick={{ fontSize: 12 }} domain={yAxisDomain} label={{ value: "数值", angle: -90, position: "insideLeft" }} />
        {chartConfig.showTooltip && <Tooltip />}
        {chartConfig.showLegend && <Legend />}
        <Brush dataKey="index" height={28} stroke="#5f82ff" startIndex={zoomDomain.startIndex} endIndex={zoomDomain.endIndex} onChange={(domain) => setZoomDomain(domain || {})} />
        {visibleSeries.map((series) => (
          <Scatter key={series.key} dataKey={series.key} fill={series.color} name={series.name} isAnimationActive={chartConfig.animationEnabled} />
        ))}
      </ScatterChart>
    );
  };

  if (!chartConfig.enabled) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-white/55">
        <div className="space-y-2 text-center">
          <p className="text-base font-medium text-foreground">图表功能未启用</p>
          <p className="text-xs text-muted-foreground">
            点击工具栏的“配置图表”或使用“智能启用”自动识别数据格式
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-[32px] border border-border/60 bg-white/80 p-3 shadow-[0_20px_45px_rgba(56,72,108,0.12)] backdrop-blur-xl">
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-[24px] border border-border/50 bg-secondary/70 px-3 py-2">
        <Button
          size="sm"
          variant={chartPaused ? "secondary" : "outline"}
          onClick={() => setChartPaused(!chartPaused)}
          className="gap-1"
        >
          {chartPaused ? (
            <>
              <Play className="h-3.5 w-3.5" />
              继续
            </>
          ) : (
            <>
              <Pause className="h-3.5 w-3.5" />
              暂停
            </>
          )}
        </Button>

        <Button size="sm" variant="outline" onClick={clearChartData} className="gap-1">
          <Trash2 className="h-3.5 w-3.5" />
          清空
        </Button>

        <Button size="sm" variant="outline" onClick={handleClearSeries} className="gap-1">
          <Trash2 className="h-3.5 w-3.5" />
          清除曲线
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={chartData.length === 0}
          className="gap-1"
        >
          <Download className="h-3.5 w-3.5" />
          导出
        </Button>

        {chartConfig.chartType === "waveform" && (
          <div className="ml-1 flex items-center gap-1 rounded-full bg-white/85 p-1 shadow-sm">
            <Button
              size="sm"
              variant={signalDomain === "time" ? "default" : "ghost"}
              onClick={() => updateSignalDomain("time")}
              className="h-7 rounded-full px-3"
            >
              Time
            </Button>
            <Button
              size="sm"
              variant={signalDomain === "fft" ? "default" : "ghost"}
              onClick={() => updateSignalDomain("fft")}
              className="h-7 rounded-full px-3"
            >
              FFT
            </Button>
          </div>
        )}

        {statistics && Object.keys(statistics).length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Info className="h-3.5 w-3.5" />
                统计
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 rounded-[24px]">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">数据统计</h4>
                {visibleSeries.map((series) => {
                  const stat = statistics[series.key];
                  if (!stat) return null;
                  return (
                    <div key={series.key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: series.color }} />
                        <span className="text-sm font-medium">{series.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pl-5 text-xs text-muted-foreground">
                        <div>最小值: {formatChartNumber(stat.min)}</div>
                        <div>最大值: {formatChartNumber(stat.max)}</div>
                        <div>平均值: {formatChartNumber(stat.avg)}</div>
                        <div>当前值: {formatChartNumber(stat.latest)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-white/80 px-3 py-1">类型: {chartConfig.chartType}</span>
          {chartConfig.chartType === "waveform" && (
            <span className="rounded-full bg-white/80 px-3 py-1">
              视图: {signalDomain === "fft" ? "FFT 频谱" : "Time 波形"}
            </span>
          )}
          <span className="rounded-full bg-white/80 px-3 py-1">缓存: {chartData.length}</span>
          <span className="rounded-full bg-white/80 px-3 py-1">
            渲染: {chartDataFormatted.length}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1">成功: {parseSuccessCount}</span>
          <span className="rounded-full bg-white/80 px-3 py-1">失败: {parseFailCount}</span>
          {estimatedSampleRate && (
            <span className="rounded-full bg-white/80 px-3 py-1">
              采样率: {estimatedSampleRate.toFixed(1)} Hz
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-[22px] border border-border/50 bg-white/70 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
          {chartConfig.chartType === "waveform"
            ? signalDomain === "fft"
              ? "FFT 频谱"
              : "Time 波形"
            : "业务图表"}
        </span>
        <span className="rounded-full bg-secondary px-3 py-1">
          {estimatedSampleRate ? `${estimatedSampleRate.toFixed(1)} Hz` : "等待采样率"}
        </span>
        <span className="rounded-full bg-secondary px-3 py-1">
          解析 {parseHealth === null ? "暂无统计" : `${parseHealth.toFixed(0)}%`}
        </span>
        <span className="rounded-full bg-secondary px-3 py-1">系列 {visibleSeries.length} 条</span>
        <span className="rounded-full bg-secondary px-3 py-1">
          缓存 {chartData.length} / {chartConfig.maxDataPoints}
        </span>
        <span className="rounded-full bg-secondary px-3 py-1">
          可视 {chartConfig.visiblePointLimit === 0 ? "自动" : chartConfig.visiblePointLimit}
        </span>
        {chartConfig.chartType === "xy-scatter" && chartConfig.xAxisField && (
          <span className="rounded-full bg-secondary px-3 py-1">
            X 轴 {chartConfig.xAxisField}
          </span>
        )}
        {chartConfig.chartType === "waveform" && (
          <span className="rounded-full bg-secondary px-3 py-1">
            FFT 窗口 {chartConfig.fftWindowSize}
          </span>
        )}
        {latestSeriesSnapshot.slice(0, 2).map((item) => (
          <span key={item.key} className="rounded-full bg-secondary px-3 py-1">
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
              style={{ backgroundColor: item.color }}
            />
            {item.name} {formatChartNumber(item.latest)}
          </span>
        ))}
      </div>

      <div className="grid min-h-[360px] flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-[360px] flex-col gap-3">
          <div className="min-h-[320px] flex-1">
            {chartDataFormatted.length === 0 ? (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-white/55">
                <div className="space-y-2 text-center">
                  <p className="text-sm font-medium text-foreground">等待数据流入…</p>
                  <p className="text-xs text-muted-foreground">
                    先接收数值流，再切到图表视图。波形示波器支持 Time / FFT 两种观察方式。
                  </p>
                </div>
              </div>
            ) : visibleSeries.length === 0 ? (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-white/55">
                <div className="space-y-2 text-center">
                  <p className="text-sm font-medium text-foreground">当前没有可见曲线</p>
                  <p className="text-xs text-muted-foreground">
                    在右侧字段栏打开显示开关，或把解析字段加入曲线。
                  </p>
                </div>
              </div>
            ) : chartConfig.chartType === "waveform" ? (
              <SignalPlotCanvas
                chartData={chartData}
                series={visibleSeries}
                chartConfig={chartConfig}
                domain={signalDomain}
              />
            ) : (
              <div className="h-full min-h-[320px] rounded-[28px] border border-border/60 bg-white/80 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  {renderBusinessChart()}
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="shrink-0 rounded-[24px] border border-border/60 bg-white/75 px-3 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <ControlField
                label="缓冲区上限"
                value={chartConfig.maxDataPoints.toString()}
                suffix="点"
                onChange={(value) => updateNumericConfig("maxDataPoints", value)}
              />
              <ControlField
                label="可视点数"
                value={chartConfig.visiblePointLimit.toString()}
                suffix={chartConfig.visiblePointLimit === 0 ? "自动" : "点"}
                onChange={(value) => updateNumericConfig("visiblePointLimit", value)}
              />
              <ControlField
                label="采样率"
                value={chartConfig.sampleRateHz.toString()}
                suffix="Hz"
                onChange={(value) => updateNumericConfig("sampleRateHz", value)}
              />
              <div className="ml-auto flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-secondary px-3 py-1">
                  缓存 {chartData.length} / {chartConfig.maxDataPoints}
                </span>
                <span className="rounded-full bg-secondary px-3 py-1">
                  渲染 {chartDataFormatted.length} 点
                </span>
                <span className="rounded-full bg-secondary px-3 py-1">
                  可见系列 {visibleSeries.length}
                </span>
                {latestSeriesSnapshot[0] && (
                  <span className="rounded-full bg-secondary px-3 py-1">
                    当前 {latestSeriesSnapshot[0].name}{" "}
                    {formatChartNumber(latestSeriesSnapshot[0].latest)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-[320px] flex-col rounded-[24px] border border-border/60 bg-white/78">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">解析字段</div>
              <div className="text-[11px] text-muted-foreground">
                实时值、曲线命名与显示控制
              </div>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-[11px] text-secondary-foreground">
              {seriesInspectorEntries.length} 项
            </span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {seriesInspectorEntries.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                先解析到结构化字段，这里才会出现实时数据。
              </div>
            ) : (
              seriesInspectorEntries.map((series) => (
                <div
                  key={series.key}
                  className="rounded-[20px] border border-border/60 bg-white/80 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: series.color }}
                    />
                    <Input
                      value={series.name}
                      onChange={(event) => {
                        const nextName = event.target.value || series.key;
                        if (series.configured) {
                          updateSeriesConfig(series.key, (item) => ({
                            ...item,
                            name: nextName,
                          }));
                          return;
                        }
                        addSeriesFromField(
                          { ...series, name: nextName },
                          { name: nextName, visible: false }
                        );
                      }}
                      placeholder={series.key}
                      className="h-8 text-sm"
                    />
                    {series.configured ? (
                      <Switch
                        checked={series.visible}
                        onCheckedChange={(checked) =>
                          updateSeriesConfig(series.key, (item) => ({
                            ...item,
                            visible: checked,
                          }))
                        }
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 px-2"
                        onClick={() => addSeriesFromField(series)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        加入曲线
                      </Button>
                    )}
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      <div>
                        key: <span className="font-mono">{series.key}</span>
                      </div>
                      <div>
                        状态:{" "}
                        {series.configured
                          ? series.visible
                            ? "显示中"
                            : "已隐藏"
                          : "仅解析，未入图"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-muted-foreground">最新值</div>
                      <div className="text-base font-semibold text-foreground">
                        {series.latestValue === null ? "—" : formatChartNumber(series.latestValue)}
                        {series.unit ? (
                          <span className="ml-1 text-xs text-muted-foreground">{series.unit}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  suffix: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-28 text-sm"
      />
      <span className="text-[11px] text-muted-foreground">{suffix}</span>
    </label>
  );
}
