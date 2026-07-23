import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDataPoint } from "@/lib/chartTypes";

interface SerialControlMiniChartProps {
  mode: "xy" | "yt";
  chartData: ChartDataPoint[];
  xChannel?: string;
  yChannel: string;
  pointLimit: number;
}

export function buildSerialControlChartData(
  mode: "xy" | "yt",
  chartData: ChartDataPoint[],
  xChannel: string | undefined,
  yChannel: string,
  pointLimit: number
) {
  const points = chartData.slice(-pointLimit);
  const firstTimestamp = points[0]?.timestamp ?? 0;
  return points.flatMap((point) => {
    const y = point.values[yChannel];
    const x = mode === "xy" ? point.values[xChannel ?? ""] : (point.timestamp - firstTimestamp) / 1000;
    return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
  });
}

export function SerialControlMiniChart({
  mode,
  chartData,
  xChannel,
  yChannel,
  pointLimit,
}: SerialControlMiniChartProps) {
  const data = buildSerialControlChartData(mode, chartData, xChannel, yChannel, pointLimit);

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground">
        等待通道数据
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={mode === "xy" ? `${xChannel} 与 ${yChannel} 二维曲线` : `${yChannel} 时间曲线`}
      className="h-56 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
          <XAxis
            type="number"
            dataKey="x"
            domain={["auto", "auto"]}
            tick={{ fontSize: 11 }}
            label={{ value: mode === "xy" ? xChannel || "X" : "时间 (s)", position: "insideBottom", offset: -4 }}
          />
          <YAxis type="number" dataKey="y" domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={48} />
          <Tooltip isAnimationActive={false} />
          <Line
            type={mode === "xy" ? "linear" : "monotone"}
            dataKey="y"
            name={yChannel || "Y"}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
