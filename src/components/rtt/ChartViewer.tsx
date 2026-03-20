/**
 * 通用图表查看器组件
 * 接收图表数据和配置作为 props，不依赖特定 store
 */

import { useMemo, useState } from "react";
import type { ChartConfig, ChartDataPoint } from "@/lib/chartTypes";
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

// Brush 缩放范围类型
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
  setChartConfig: _setChartConfig,
}: ChartViewerProps) {
  // 缩放范围状态
  const [zoomDomain, setZoomDomain] = useState<BrushDomain>({});

  // 格式化时间戳为可读格式（简化版）
  const formatTimestamp = (timestamp: number, _index: number, firstTimestamp: number) => {
    // 使用相对时间（秒）
    const relativeSeconds = ((timestamp - firstTimestamp) / 1000).toFixed(1);
    return `${relativeSeconds}s`;
  };

  // 转换数据格式为 Recharts 需要的格式
  const chartDataFormatted = useMemo(() => {
    if (chartData.length === 0) return [];
    const firstTimestamp = chartData[0].timestamp;

    // XY 散点图模式：使用指定的 X 轴字段
    if (chartConfig.chartType === "xy-scatter" && chartConfig.xAxisField) {
      return chartData.map((point, index) => ({
        index,
        timestamp: point.timestamp,
        time: formatTimestamp(point.timestamp, index, firstTimestamp),
        ...point.values,
      }));
    }

    // 普通模式：使用索引作为 X 轴
    return chartData.map((point, index) => ({
      index,
      timestamp: point.timestamp,
      time: formatTimestamp(point.timestamp, index, firstTimestamp),
      ...point.values,
    }));
  }, [chartData, chartConfig.chartType, chartConfig.xAxisField]);

  // 计算 Y 轴范围
  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];

    let min = Infinity;
    let max = -Infinity;

    chartData.forEach((point) => {
      Object.entries(point.values).forEach(([key, value]) => {
        // XY 散点图模式：排除 X 轴字段
        if (chartConfig.chartType === "xy-scatter" && key === chartConfig.xAxisField) {
          return;
        }
        if (typeof value === "number") {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      });
    });

    // 处理边界情况：所有值相同
    if (min === max) {
      const center = min;
      const range = Math.abs(center) * 0.1 || 10; // 如果是 0，使用固定范围
      return [center - range, center + range];
    }

    // 添加 10% 的边距
    const margin = (max - min) * 0.1;
    return [Math.floor(min - margin), Math.ceil(max + margin)];
  }, [chartData, chartConfig.chartType, chartConfig.xAxisField]);

  // 计算 X 轴范围（仅用于 XY 散点图）
  const xAxisDomain = useMemo(() => {
    if (chartConfig.chartType !== "xy-scatter" || !chartConfig.xAxisField) {
      return undefined;
    }

    if (chartData.length === 0) return [0, 100];

    let min = Infinity;
    let max = -Infinity;

    chartData.forEach((point) => {
      const value = point.values[chartConfig.xAxisField!];
      if (typeof value === "number") {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });

    // 处理边界情况：所有值相同
    if (min === max) {
      const center = min;
      const range = Math.abs(center) * 0.1 || 10;
      return [center - range, center + range];
    }

    // 添加 10% 的边距
    const margin = (max - min) * 0.1;
    return [Math.floor(min - margin), Math.ceil(max + margin)];
  }, [chartData, chartConfig.chartType, chartConfig.xAxisField]);

  // 获取可见的系列
  const visibleSeries = useMemo(() => {
    return chartConfig.series.filter((s) => s.visible);
  }, [chartConfig.series]);

  // 计算统计信息
  const statistics = useMemo(() => {
    if (chartData.length === 0) return null;

    const stats: Record<string, { min: number; max: number; avg: number; latest: number }> = {};

    visibleSeries.forEach((series) => {
      const values = chartData
        .map((point) => point.values[series.key])
        .filter((v) => typeof v === "number") as number[];

      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
        const latest = values[values.length - 1];

        stats[series.key] = { min, max, avg, latest };
      }
    });

    return stats;
  }, [chartData, visibleSeries]);

  // 导出数据为 CSV
  const handleExport = () => {
    if (chartData.length === 0) {
      return;
    }

    // 构建 CSV 头部
    const headers = ["时间戳", "相对时间(s)"];
    const keys: string[] = [];
    if (chartData.length > 0) {
      keys.push(...Object.keys(chartData[0].values));
      headers.push(...keys);
    }

    // 构建 CSV 内容
    const firstTimestamp = chartData[0].timestamp;
    const rows = chartData.map((point) => {
      const relativeTime = ((point.timestamp - firstTimestamp) / 1000).toFixed(1);
      const row = [
        point.timestamp.toString(),
        relativeTime,
      ];
      keys.forEach((key) => {
        row.push((point.values[key] ?? "").toString());
      });
      return row.join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    // 下载文件
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chart-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 如果图表功能未启用
  if (!chartConfig.enabled) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">图表功能未启用</p>
          <p className="text-xs text-muted-foreground">
            请点击工具栏的"配置图表"按钮进行配置
          </p>
        </div>
      </div>
    );
  }

  // 如果没有配置系列
  if (chartConfig.series.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">未配置数据系列</p>
          <p className="text-xs text-muted-foreground">
            请点击工具栏的"配置图表"按钮添加数据系列
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 控制栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <Button
          size="sm"
          variant="outline"
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

        <Button
          size="sm"
          variant="outline"
          onClick={clearChartData}
          className="gap-1"
        >
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

        {/* 统计信息 */}
        {statistics && Object.keys(statistics).length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Info className="h-3.5 w-3.5" />
                统计
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">数据统计</h4>
                {visibleSeries.map((series) => {
                  const stat = statistics[series.key];
                  if (!stat) return null;
                  return (
                    <div key={series.key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: series.color }}
                        />
                        <span className="text-sm font-medium">{series.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pl-5">
                        <div>最小值: {stat.min.toFixed(2)}</div>
                        <div>最大值: {stat.max.toFixed(2)}</div>
                        <div>平均值: {stat.avg.toFixed(2)}</div>
                        <div>当前值: {stat.latest.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div className="flex-1" />

        {/* 统计信息 */}
        <div className="text-xs text-muted-foreground space-x-3">
          <span>数据点: {chartData.length}</span>
          <span>成功: {parseSuccessCount}</span>
          <span>失败: {parseFailCount}</span>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="flex-1 p-4">
        {chartDataFormatted.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">等待数据...</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartConfig.chartType === "line" ? (
              <LineChart data={chartDataFormatted}>
                {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis
                  dataKey="index"
                  tick={{ fontSize: 12 }}
                  label={{ value: "数据点", position: "insideBottom", offset: -5 }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  domain={yAxisDomain}
                  label={{ value: "数值", angle: -90, position: "insideLeft" }}
                />
                {chartConfig.showTooltip && <Tooltip />}
                {chartConfig.showLegend && <Legend />}
                <Brush
                  dataKey="index"
                  height={30}
                  stroke="#8884d8"
                  startIndex={zoomDomain.startIndex}
                  endIndex={zoomDomain.endIndex}
                  onChange={(domain: BrushDomain) => setZoomDomain(domain)}
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
                <XAxis
                  dataKey="index"
                  tick={{ fontSize: 12 }}
                  label={{ value: "数据点", position: "insideBottom", offset: -5 }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  domain={yAxisDomain}
                  label={{ value: "数值", angle: -90, position: "insideLeft" }}
                />
                {chartConfig.showTooltip && <Tooltip />}
                {chartConfig.showLegend && <Legend />}
                <Brush
                  dataKey="index"
                  height={30}
                  stroke="#8884d8"
                  startIndex={zoomDomain.startIndex}
                  endIndex={zoomDomain.endIndex}
                  onChange={(domain: BrushDomain) => setZoomDomain(domain)}
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
                  label={{
                    value: chartConfig.xAxisField || "X",
                    position: "insideBottom",
                    offset: -5
                  }}
                />
                <YAxis
                  type="number"
                  tick={{ fontSize: 12 }}
                  domain={yAxisDomain}
                  label={{ value: "Y", angle: -90, position: "insideLeft" }}
                />
                {chartConfig.showTooltip && <Tooltip />}
                {chartConfig.showLegend && <Legend />}
                <Brush
                  dataKey="index"
                  height={30}
                  stroke="#8884d8"
                  startIndex={zoomDomain.startIndex}
                  endIndex={zoomDomain.endIndex}
                  onChange={(domain: BrushDomain) => setZoomDomain(domain)}
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
                <XAxis
                  dataKey="index"
                  tick={{ fontSize: 12 }}
                  label={{ value: "数据点", position: "insideBottom", offset: -5 }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  domain={yAxisDomain}
                  label={{ value: "数值", angle: -90, position: "insideLeft" }}
                />
                {chartConfig.showTooltip && <Tooltip />}
                {chartConfig.showLegend && <Legend />}
                <Brush
                  dataKey="index"
                  height={30}
                  stroke="#8884d8"
                  startIndex={zoomDomain.startIndex}
                  endIndex={zoomDomain.endIndex}
                  onChange={(domain: BrushDomain) => setZoomDomain(domain)}
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
        )}
      </div>
    </div>
  );
}
