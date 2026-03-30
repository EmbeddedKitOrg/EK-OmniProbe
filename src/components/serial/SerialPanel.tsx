import { useSerialStore } from "@/stores/serialStore";
import { SerialToolbar } from "./SerialToolbar";
import { SerialViewer } from "./SerialViewer";
import { SerialSendBar } from "./SerialSendBar";
import { ChartViewer } from "@/components/rtt/ChartViewer";
import { Panel, Group, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import { Activity, AlertCircle, BarChart3, FileText, Waves } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

interface SerialPanelProps {
  className?: string;
}

// Wrapper component for chart that uses serial store
function SerialChartViewer() {
  const {
    chartData,
    chartConfig,
    chartPaused,
    parseSuccessCount,
    parseFailCount,
    setChartPaused,
    clearChartData,
    setChartConfig,
  } = useSerialStore();

  return (
    <ChartViewer
      chartData={chartData}
      chartConfig={chartConfig}
      chartPaused={chartPaused}
      parseSuccessCount={parseSuccessCount}
      parseFailCount={parseFailCount}
      setChartPaused={setChartPaused}
      clearChartData={clearChartData}
      setChartConfig={setChartConfig}
    />
  );
}

// Terminal viewer section - can be split by direction or single view
function TerminalSection({ splitByDirection }: { splitByDirection: boolean }) {
  if (splitByDirection) {
    return (
      <Group orientation="horizontal">
        <Panel defaultSize={50} minSize={20}>
          <SerialViewer direction="rx" title="接收 (RX)" />
        </Panel>
        <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
        <Panel defaultSize={50} minSize={20}>
          <SerialViewer direction="tx" title="发送 (TX)" />
        </Panel>
      </Group>
    );
  }
  return <SerialViewer />;
}

export function SerialPanel({ className }: SerialPanelProps) {
  const {
    error,
    viewMode,
    splitRatio,
    setSplitRatio,
    splitByDirection,
    connected,
    running,
    lines,
    chartConfig,
  } = useSerialStore();

  const workflowHint = !connected
    ? {
        icon: Activity,
        title: "先连接串口",
        description: "在左侧选择本地 COM 或 TCP 串口并连接，再开始接收数据。",
      }
    : !running
      ? {
          icon: Activity,
          title: "串口已连接，等待开始接收",
          description: "点击工具栏里的“开始”，即可进入持续接收状态。",
        }
      : lines.length === 0
        ? {
            icon: FileText,
            title: "串口正在接收，等待数据流入",
            description: "收到结构化数值后，可以直接切到“波形 / FFT”，或保留分屏一起观察。",
          }
        : chartConfig.enabled
          ? {
              icon: chartConfig.signalDomain === "fft" ? BarChart3 : Waves,
              title: chartConfig.signalDomain === "fft" ? "当前处于 FFT 分析链路" : "当前处于波形分析链路",
              description: "如果开启收发分屏，仍可以同时保留终端区查看 RX / TX 文本。",
            }
          : {
              icon: Waves,
              title: "已经收到数据，可以启用图表",
              description: "点“智能启用”自动生成图表配置，或直接点“波形 / FFT”查看数值流。",
            };

  return (
    <div className={cn("flex h-full flex-col gap-3", className)}>
      {/* Toolbar */}
      <SerialToolbar />

      <PanelHintCard
        icon={workflowHint.icon}
        title={workflowHint.title}
        description={workflowHint.description}
      />

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 rounded-[22px] border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">串口工作流出现错误</div>
            <div className="mt-1 text-xs leading-5 text-red-500/90">{error}</div>
          </div>
        </div>
      )}

      {/* Data display area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "text" ? (
          // Text only mode - respect splitByDirection
          <PanelShell
            title="文本区"
            subtitle={splitByDirection ? "当前按收发方向分屏，方便同时查看 RX / TX。" : "查看原始终端输出、搜索命中和时间戳。"}
            badge={splitByDirection ? "RX / TX" : "Console"}
          >
            <TerminalSection splitByDirection={splitByDirection} />
          </PanelShell>
        ) : viewMode === "chart" ? (
          // Chart only mode
          <PanelShell
            title="图表区"
            subtitle="查看波形、FFT 或结构化串口图表。"
            badge={chartConfig.signalDomain === "fft" ? "FFT" : "Chart"}
          >
            <SerialChartViewer />
          </PanelShell>
        ) : (
          // Split mode (terminal + chart) - terminal section respects splitByDirection
          <Group orientation="vertical">
            <Panel
              defaultSize={splitRatio * 100}
              minSize={20}
              onResize={(panelSize) => setSplitRatio(panelSize.asPercentage / 100)}
            >
              <div className="h-full min-h-0 pb-1">
                <PanelShell
                  title="文本区"
                  subtitle={splitByDirection ? "上方保留终端视图，并按收发方向拆分。" : "上方保留原始终端输出，方便和图表结果互相对照。"}
                  badge={splitByDirection ? "RX / TX" : "Console"}
                >
                  <TerminalSection splitByDirection={splitByDirection} />
                </PanelShell>
              </div>
            </Panel>
            <Separator className="h-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={(1 - splitRatio) * 100} minSize={20}>
              <div className="h-full min-h-0 pt-1">
                <PanelShell
                  title="图表区"
                  subtitle="智能启用、波形和 FFT 都会在这里展开。"
                  badge={chartConfig.signalDomain === "fft" ? "FFT" : "Chart"}
                >
                  <SerialChartViewer />
                </PanelShell>
              </div>
            </Panel>
          </Group>
        )}
      </div>

      {/* Send bar */}
      <SerialSendBar />
    </div>
  );
}

interface PanelHintCardProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

function PanelHintCard({ icon: Icon, title, description }: PanelHintCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-[18px] border border-border/60 bg-white/60 px-3 py-2 text-sm shadow-[0_6px_14px_rgba(73,93,142,0.05)]">
      <div className="rounded-full bg-primary/10 p-1.5 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </div>
  );
}

interface PanelShellProps {
  title: string;
  subtitle: string;
  badge: string;
  children: ReactNode;
}

function PanelShell({ title, subtitle, badge, children }: PanelShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/60 bg-white/75 shadow-[0_12px_26px_rgba(73,93,142,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-white/72 px-4 py-2.5">
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-secondary-foreground">
          {badge}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
