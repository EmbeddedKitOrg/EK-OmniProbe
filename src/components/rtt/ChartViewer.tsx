import { useMemo, useState } from "react";
import type { ChartConfig, ChartDataPoint, SignalDomain } from "@/lib/chartTypes";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Pause, Play, Trash2, Download, Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SignalPlotCanvas } from "./SignalPlotCanvas";

interface BrushDomain {
  startIndex?: number;
  endIndex?: number;
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

  const chartDataFormatted = useMemo(() => {
    if (chartData.length === 0) return [];
    const firstTimestamp = chartData[0].timestamp;
    return chartData.map((point, index) => ({
      index,
      timestamp: point.timestamp,
      time: ((point.timestamp - firstTimestamp) / 1000).toFixed(3),
      ...point.values,
    }));
  }, [chartData]);

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

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [0, 100];
    }

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

    const first = chartData[Math.max(chartData.length - 100, 0)].timestamp;
    const last = chartData[chartData.length - 1].timestamp;
    const count = chartData.length - Math.max(chartData.length - 100, 0) - 1;
    const durationSec = (last - first) / 1000;
    if (durationSec <= 0 || count <= 0) return null;
    return count / durationSec;
  }, [chartConfig.sampleRateHz, chartData]);

  const parseHealth = useMemo(() => {
    const total = parseSuccessCount + parseFailCount;
    if (total === 0) return null;
    return (parseSuccessCount / total) * 100;
  }, [parseFailCount, parseSuccessCount]);

  const latestSeriesSnapshot = useMemo(() => {
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
          avg: stat.avg,
        };
      })
      .filter((item): item is { key: string; name: string; color: string; latest: number; avg: number } => item !== null)
      .slice(0, 4);
  }, [statistics, visibleSeries]);

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

  if (!chartConfig.enabled) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-white/55">
        <div className="space-y-2 text-center">
          <p className="text-base font-medium text-foreground">图表功能未启用</p>
          <p className="text-xs text-muted-foreground">点击工具栏的“配置图表”或使用“智能启用”自动识别数据格式</p>
        </div>
      </div>
    );
  }

  if (chartConfig.series.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-white/55">
        <div className="space-y-2 text-center">
          <p className="text-base font-medium text-foreground">未配置数据系列</p>
          <p className="text-xs text-muted-foreground">先添加数据系列，再选择波形、折线、柱状图或散点图视图</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-[32px] border border-border/60 bg-white/80 p-3 shadow-[0_20px_45px_rgba(56,72,108,0.12)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2 rounded-[24px] border border-border/50 bg-secondary/70 px-3 py-2">
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
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: series.color }}
                        />
                        <span className="text-sm font-medium">{series.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pl-5 text-xs text-muted-foreground">
                        <div>最小值: {stat.min.toFixed(3)}</div>
                        <div>最大值: {stat.max.toFixed(3)}</div>
                        <div>平均值: {stat.avg.toFixed(3)}</div>
                        <div>当前值: {stat.latest.toFixed(3)}</div>
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
          <span className="rounded-full bg-white/80 px-3 py-1">数据点: {chartData.length}</span>
          <span className="rounded-full bg-white/80 px-3 py-1">成功: {parseSuccessCount}</span>
          <span className="rounded-full bg-white/80 px-3 py-1">失败: {parseFailCount}</span>
          {chartConfig.chartType === "waveform" && estimatedSampleRate && (
            <span className="rounded-full bg-white/80 px-3 py-1">采样率: {estimatedSampleRate.toFixed(1)} Hz</span>
          )}
          {chartConfig.chartType === "waveform" && signalDomain === "fft" && (
            <span className="rounded-full bg-white/80 px-3 py-1">窗口: {chartConfig.fftWindowSize}</span>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="glass-section rounded-[24px] p-4">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">观察域</div>
          <div className="mt-2 text-base font-semibold text-foreground">
            {chartConfig.chartType === "waveform"
              ? signalDomain === "fft"
                ? "FFT 频谱"
                : "Time 波形"
              : "业务图表"}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {chartConfig.chartType === "waveform"
              ? "适合实时数值流调试，支持缩放、拖拽和平移。"
              : "适合结构化趋势数据、离散数据或 XY 关系展示。"}
          </p>
        </div>

        <div className="glass-section rounded-[24px] p-4">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">采样与缓存</div>
          <div className="mt-2 text-base font-semibold text-foreground">
            {estimatedSampleRate ? `${estimatedSampleRate.toFixed(1)} Hz` : "等待估算"}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            缓存 {chartData.length} / {chartConfig.maxDataPoints} 点
            {chartConfig.chartType === "waveform" && ` · FFT 窗口 ${chartConfig.fftWindowSize}`}
          </p>
        </div>

        <div className="glass-section rounded-[24px] p-4">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">解析健康度</div>
          <div className="mt-2 text-base font-semibold text-foreground">
            {parseHealth === null ? "暂无统计" : `${parseHealth.toFixed(0)}%`}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            成功 {parseSuccessCount} 次 · 失败 {parseFailCount} 次
          </p>
        </div>

        <div className="glass-section rounded-[24px] p-4">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">活跃系列</div>
          <div className="mt-2 text-base font-semibold text-foreground">{visibleSeries.length} 条</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            刷新间隔 {chartConfig.updateInterval} ms
            {chartConfig.chartType === "xy-scatter" && chartConfig.xAxisField
              ? ` · X 轴 ${chartConfig.xAxisField}`
              : ""}
          </p>
        </div>
      </div>

      {latestSeriesSnapshot.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {latestSeriesSnapshot.map((item) => (
            <div key={item.key} className="glass-section rounded-[22px] p-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
              </div>
              <div className="mt-3 text-lg font-semibold text-foreground">{item.latest.toFixed(3)}</div>
              <div className="mt-1 text-xs text-muted-foreground">平均值 {item.avg.toFixed(3)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1">
        {chartDataFormatted.length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-white/55">
            <div className="space-y-2 text-center">
              <p className="text-sm font-medium text-foreground">等待数据流入…</p>
              <p className="text-xs text-muted-foreground">
                先接收数值流，再切换到图表视图。波形示波器支持 Time / FFT 两种观察方式。
              </p>
              <p className="text-xs text-muted-foreground">
                建议先点工具栏的“智能启用”，或者直接点“波形 / FFT”快捷入口。
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
              {chartConfig.chartType === "line" ? (
                <LineChart data={chartDataFormatted}>
                  {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} label={{ value: "时间 (s)", position: "insideBottom", offset: -5 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={yAxisDomain} label={{ value: "数值", angle: -90, position: "insideLeft" }} />
                  {chartConfig.showTooltip && <Tooltip />}
                  {chartConfig.showLegend && <Legend />}
                  <Brush
                    dataKey="index"
                    height={28}
                    stroke="#5f82ff"
                    startIndex={zoomDomain.startIndex}
                    endIndex={zoomDomain.endIndex}
                    onChange={(domain) => setZoomDomain(domain || {})}
                  />
                  {visibleSeries.map((series) => (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      stroke={series.color}
                      name={series.name}
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={chartConfig.animationEnabled}
                    />
                  ))}
                </LineChart>
              ) : chartConfig.chartType === "bar" ? (
                <BarChart data={chartDataFormatted}>
                  {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} label={{ value: "时间 (s)", position: "insideBottom", offset: -5 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={yAxisDomain} label={{ value: "数值", angle: -90, position: "insideLeft" }} />
                  {chartConfig.showTooltip && <Tooltip />}
                  {chartConfig.showLegend && <Legend />}
                  <Brush
                    dataKey="index"
                    height={28}
                    stroke="#5f82ff"
                    startIndex={zoomDomain.startIndex}
                    endIndex={zoomDomain.endIndex}
                    onChange={(domain) => setZoomDomain(domain || {})}
                  />
                  {visibleSeries.map((series) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      fill={series.color}
                      name={series.name}
                      isAnimationActive={chartConfig.animationEnabled}
                    />
                  ))}
                </BarChart>
              ) : chartConfig.chartType === "xy-scatter" ? (
                <ScatterChart data={chartDataFormatted}>
                  {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                  <XAxis
                    type="number"
                    dataKey={chartConfig.xAxisField || "index"}
                    domain={xAxisDomain || ["auto", "auto"]}
                    tick={{ fontSize: 12 }}
                    label={{ value: chartConfig.xAxisField || "X", position: "insideBottom", offset: -5 }}
                  />
                  <YAxis type="number" tick={{ fontSize: 12 }} domain={yAxisDomain} label={{ value: "Y", angle: -90, position: "insideLeft" }} />
                  {chartConfig.showTooltip && <Tooltip />}
                  {chartConfig.showLegend && <Legend />}
                  <Brush
                    dataKey="index"
                    height={28}
                    stroke="#5f82ff"
                    startIndex={zoomDomain.startIndex}
                    endIndex={zoomDomain.endIndex}
                    onChange={(domain) => setZoomDomain(domain || {})}
                  />
                  {visibleSeries.map((series) => (
                    <Scatter
                      key={series.key}
                      dataKey={series.key}
                      fill={series.color}
                      name={series.name}
                      isAnimationActive={chartConfig.animationEnabled}
                    />
                  ))}
                </ScatterChart>
              ) : (
                <ScatterChart data={chartDataFormatted}>
                  {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} label={{ value: "时间 (s)", position: "insideBottom", offset: -5 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={yAxisDomain} label={{ value: "数值", angle: -90, position: "insideLeft" }} />
                  {chartConfig.showTooltip && <Tooltip />}
                  {chartConfig.showLegend && <Legend />}
                  <Brush
                    dataKey="index"
                    height={28}
                    stroke="#5f82ff"
                    startIndex={zoomDomain.startIndex}
                    endIndex={zoomDomain.endIndex}
                    onChange={(domain) => setZoomDomain(domain || {})}
                  />
                  {visibleSeries.map((series) => (
                    <Scatter
                      key={series.key}
                      dataKey={series.key}
                      fill={series.color}
                      name={series.name}
                      isAnimationActive={chartConfig.animationEnabled}
                    />
                  ))}
                </ScatterChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
