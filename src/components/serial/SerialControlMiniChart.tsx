import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDataPoint } from "@/lib/chartTypes";

interface SerialControlMiniChartProps {
  mode: "xy" | "yt";
  chartData: ChartDataPoint[];
  xChannel?: string;
  yChannels: string[];
  pointLimit: number;
}

export function buildSerialControlChartData(
  mode: "xy" | "yt",
  chartData: ChartDataPoint[],
  xChannel: string | undefined,
  yChannels: string[],
  pointLimit: number
) {
  const points = chartData.slice(-pointLimit);
  const firstTimestamp = points[0]?.timestamp ?? 0;
  return points.flatMap((point) => {
    const x = mode === "xy" ? point.values[xChannel ?? ""] : (point.timestamp - firstTimestamp) / 1000;
    const values = Object.fromEntries(
      yChannels.flatMap((channel) => (Number.isFinite(point.values[channel]) ? [[channel, point.values[channel]]] : []))
    );
    return Number.isFinite(x) && Object.keys(values).length > 0 ? [{ __x: x, ...values }] : [];
  });
}

export function SerialControlMiniChart({
  mode,
  chartData,
  xChannel,
  yChannels,
  pointLimit,
}: SerialControlMiniChartProps) {
  const data = buildSerialControlChartData(mode, chartData, xChannel, yChannels, pointLimit);

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
      aria-label={mode === "xy" ? `${xChannel} 与 ${yChannels[0]} 二维曲线` : `${yChannels.join("、")} 时间曲线`}
      className="h-56 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
          <XAxis
            type="number"
            dataKey="__x"
            domain={["auto", "auto"]}
            tick={{ fontSize: 11 }}
            label={{ value: mode === "xy" ? xChannel || "X" : "时间 (s)", position: "insideBottom", offset: -4 }}
          />
          <YAxis type="number" domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={48} />
          <Tooltip isAnimationActive={false} />
          {yChannels.map((channel, index) => (
            <Line
              key={channel}
              type={mode === "xy" ? "linear" : "monotone"}
              dataKey={channel}
              name={channel}
              stroke={["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4"][index % 6]}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
