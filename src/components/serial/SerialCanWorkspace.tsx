import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, Download, Gauge, List, Network, Send, Trash2, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportCanFramesAsCsv } from "@/lib/exporters";
import { buildSlcanInitCommands, calculateCanLoad, type CanLoadSnapshot } from "@/lib/parseCan";
import type { ChartDataPoint } from "@/lib/chartTypes";
import { sendSerialPayload } from "@/lib/serialSend";
import { useLogStore } from "@/stores/logStore";
import { useSerialStore } from "@/stores/serialStore";
import { useShallow } from "zustand/react/shallow";
import { CanNodeEditor } from "./CanNodeEditor";
import { CanTransmitPanel } from "./CanTransmitPanel";

interface SerialCanWorkspaceProps {
  chart: ReactNode;
}

interface LoadHistoryPoint {
  timestamp: number;
  ratio: number;
}

export function SerialCanWorkspace({ chart }: SerialCanWorkspaceProps) {
  const { chartData, chartConfig, connected, clearChartData, setChartConfig } = useSerialStore(
    useShallow((state) => ({
      chartData: state.chartData,
      chartConfig: state.chartConfig,
      connected: state.connected,
      clearChartData: state.clearChartData,
      setChartConfig: state.setChartConfig,
    }))
  );
  const canBus = chartConfig.canBus;
  const addLog = useLogStore((state) => state.addLog);
  const [now, setNow] = useState(0);
  const [history, setHistory] = useState<LoadHistoryPoint[]>([]);
  const canSamples = useMemo(() => chartData.filter((sample) => sample.canFrame), [chartData]);
  const snapshot = useMemo(() => calculateCanLoad(canSamples, canBus, now), [canBus, canSamples, now]);
  const snapshotRef = useRef(snapshot);
  const initializedRef = useRef(false);
  snapshotRef.current = snapshot;

  const initializeAdapter = useCallback(async () => {
    const commands = buildSlcanInitCommands(canBus);
    await sendSerialPayload(commands.join("\r"), { encoding: "utf-8", lineEnding: "cr" });
    addLog("success", `SLCAN 适配器初始化完成：${commands.join(" · ")}`);
  }, [addLog, canBus]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setHistory((current) => [...current, { timestamp: now, ratio: snapshotRef.current.loadRatio }].slice(-120));
  }, [now]);

  useEffect(() => setHistory([]), [canBus.bitrate, canBus.loadWindowMs]);

  useEffect(() => {
    if (!connected) {
      initializedRef.current = false;
      return;
    }
    if (!canBus.autoInitialize || initializedRef.current) return;
    initializedRef.current = true;
    void initializeAdapter().catch((error) => {
      initializedRef.current = false;
      addLog("error", `SLCAN 自动初始化失败：${error}`);
    });
  }, [addLog, canBus.autoInitialize, connected, initializeAdapter]);

  const handleExport = async () => {
    try {
      const path = await exportCanFramesAsCsv(canSamples);
      if (path) addLog("success", `已导出 ${canSamples.length} 个 CAN 帧到 ${path}`);
    } catch (error) {
      addLog("error", `导出 CAN 帧失败: ${error}`);
    }
  };

  return (
    <Tabs defaultValue="signals" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
        <TabsList className="h-8">
          <TabsTrigger value="signals" className="h-6 gap-1.5 px-2 text-xs">
            <Waves className="h-3.5 w-3.5" />
            信号
          </TabsTrigger>
          <TabsTrigger value="frames" className="h-6 gap-1.5 px-2 text-xs">
            <List className="h-3.5 w-3.5" />帧
          </TabsTrigger>
          <TabsTrigger value="load" className="h-6 gap-1.5 px-2 text-xs">
            <Gauge className="h-3.5 w-3.5" />
            负载
          </TabsTrigger>
          <TabsTrigger value="nodes" className="h-6 gap-1.5 px-2 text-xs">
            <Network className="h-3.5 w-3.5" />
            节点
          </TabsTrigger>
          <TabsTrigger value="send" className="h-6 gap-1.5 px-2 text-xs">
            <Send className="h-3.5 w-3.5" />
            发送
          </TabsTrigger>
        </TabsList>
        <span className="text-xs tabular-nums text-muted-foreground">{canSamples.length} 帧缓存</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={handleExport}
            disabled={canSamples.length === 0}
            title="导出 CAN 帧 CSV"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={clearChartData}
            disabled={canSamples.length === 0}
            title="清空 CAN 帧与图表"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <TabsContent value="signals" className="mt-0 min-h-0 flex-1 overflow-hidden">
        {chart}
      </TabsContent>
      <TabsContent value="frames" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <CanFrameTable samples={canSamples} />
      </TabsContent>
      <TabsContent value="load" className="mt-0 min-h-0 flex-1 overflow-y-auto">
        <CanLoadView
          snapshot={snapshot}
          history={history}
          threshold={canBus.alarmThreshold}
          bitrate={canBus.bitrate}
          dataBitrate={canBus.dataBitrate}
        />
      </TabsContent>
      <TabsContent value="nodes" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <CanNodeEditor
          channels={chartConfig.channels}
          onChannelsChange={(channels) => setChartConfig({ ...chartConfig, channels })}
        />
      </TabsContent>
      <TabsContent value="send" className="mt-0 min-h-0 flex-1 overflow-y-auto">
        <CanTransmitPanel connected={connected} onInitialize={initializeAdapter} />
      </TabsContent>
    </Tabs>
  );
}

function CanFrameTable({ samples }: { samples: ChartDataPoint[] }) {
  const recent = samples.slice(-500).reverse();
  if (recent.length === 0) {
    return <EmptyCanState message="等待 SLCAN t/T/r/R/d/D/b/B 帧" />;
  }

  return (
    <div className="h-full overflow-auto font-mono text-xs">
      <div className="sticky top-0 z-10 grid min-w-[760px] grid-cols-[120px_92px_48px_1fr_1fr] gap-3 border-b border-border bg-background px-3 py-2 text-muted-foreground">
        <span>时间</span>
        <span>CAN ID</span>
        <span>DLC</span>
        <span>DATA</span>
        <span>解析信号</span>
      </div>
      {recent.map((sample, index) => {
        const frame = sample.canFrame!;
        const idWidth = frame.extended ? 8 : 3;
        const signals = Object.entries(sample.values)
          .map(([key, value]) => `${key}=${formatNumber(value)}`)
          .join("  ");
        return (
          <div
            key={`${sample.timestamp}-${frame.id}-${index}`}
            className="grid min-w-[760px] grid-cols-[120px_92px_48px_1fr_1fr] gap-3 border-b border-border/50 px-3 py-1.5 hover:bg-muted/40"
          >
            <span className="text-muted-foreground">{formatTime(sample.timestamp)}</span>
            <span className="font-medium text-foreground">
              {frame.extended ? "X:" : "S:"}
              {frame.id.toString(16).toUpperCase().padStart(idWidth, "0")}
              {frame.rtr ? " RTR" : ""}
            </span>
            <span>{frame.fd ? `${frame.dlc}/${frame.data.length}B` : frame.dlc}</span>
            <span>{frame.rtr ? "-" : frame.data.map(formatByte).join(" ")}</span>
            <span className="truncate text-primary" title={signals}>
              {signals || "-"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CanLoadView({
  snapshot,
  history,
  threshold,
  bitrate,
  dataBitrate,
}: {
  snapshot: CanLoadSnapshot;
  history: LoadHistoryPoint[];
  threshold: number;
  bitrate: number;
  dataBitrate: number;
}) {
  const alarm = snapshot.loadRatio >= threshold;
  return (
    <div className="space-y-4 p-4">
      {alarm && (
        <div className="flex items-center gap-2 rounded-[8px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          <Activity className="h-4 w-4" />
          CAN 负载已达到 {formatPercent(snapshot.loadRatio)}，超过 {formatPercent(threshold)} 告警阈值。
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="总线负载" value={formatPercent(snapshot.loadRatio)} alert={alarm} />
        <Metric label="帧率" value={`${snapshot.framesPerSecond.toFixed(1)} FPS`} />
        <Metric label="窗口帧数" value={snapshot.frameCount.toLocaleString()} />
        <Metric label="仲裁 / 数据波特率" value={`${formatBitrate(bitrate)} / ${formatBitrate(dataBitrate)}`} />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">负载历史</span>
          <span className="text-muted-foreground">串口接收时间近似 · 位填充按 20% 估算</span>
        </div>
        <LoadHistoryChart history={history} threshold={threshold} />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">CAN ID 负载分布</span>
          <span className="text-muted-foreground">
            {snapshot.totalBits.toLocaleString()} bit · {snapshot.totalBytes.toLocaleString()} byte
          </span>
        </div>
        {snapshot.perId.length === 0 ? (
          <EmptyCanState message="当前统计窗口内没有 CAN 帧" compact />
        ) : (
          <div className="space-y-1.5">
            {snapshot.perId.map((item) => {
              const share = snapshot.totalBits > 0 ? item.totalBits / snapshot.totalBits : 0;
              return (
                <div
                  key={`${item.extended}-${item.id}`}
                  className="grid grid-cols-[100px_1fr_72px] items-center gap-3 text-xs"
                >
                  <span className="font-mono">
                    {item.extended ? "X:" : "S:"}
                    {item.id
                      .toString(16)
                      .toUpperCase()
                      .padStart(item.extended ? 8 : 3, "0")}
                  </span>
                  <div className="h-5 overflow-hidden rounded bg-muted">
                    <div className="h-full bg-primary/70" style={{ width: `${Math.max(share * 100, 1)}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {formatPercent(share)} · {item.frameCount}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function LoadHistoryChart({ history, threshold }: { history: LoadHistoryPoint[]; threshold: number }) {
  const max = Math.max(1, threshold * 1.25, ...history.map(({ ratio }) => ratio));
  const points = history
    .map(({ ratio }, index) => {
      const x = history.length <= 1 ? 0 : (index / (history.length - 1)) * 100;
      return `${x},${40 - (Math.min(ratio, max) / max) * 36}`;
    })
    .join(" ");
  const thresholdY = 40 - (threshold / max) * 36;

  return (
    <div className="aspect-[5/1] min-h-28 w-full overflow-hidden rounded-[8px] border border-border/60 bg-background">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" aria-label="CAN 负载历史图">
        <line
          x1="0"
          y1={thresholdY}
          x2="100"
          y2={thresholdY}
          stroke="rgb(239 68 68)"
          strokeWidth="0.35"
          strokeDasharray="2 2"
        />
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
            className="text-primary"
          />
        )}
      </svg>
    </div>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-[8px] border border-border/60 bg-background px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${alert ? "text-red-600" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyCanState({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-center text-sm text-muted-foreground ${compact ? "h-20" : "h-full"}`}>
      {message}
    </div>
  );
}

function formatByte(value: number) {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString([], { hour12: false })}.${date.getMilliseconds().toString().padStart(3, "0")}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toPrecision(6).replace(/\.?0+$/, "");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}

function formatBitrate(value: number) {
  return value >= 1_000_000 ? `${value / 1_000_000} Mbit/s` : `${value / 1_000} kbit/s`;
}
