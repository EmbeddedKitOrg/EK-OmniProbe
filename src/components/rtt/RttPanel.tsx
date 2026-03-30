import { useRttStore } from "@/stores/rttStore";
import { RttToolbar } from "./RttToolbar";
import { RttViewer } from "./RttViewer";
import { RttStatusBar } from "./RttStatusBar";
import { RttChartViewer } from "./RttChartViewer";
import { Panel, Group, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import { AlertCircle, BarChart3, FileText, Link, Waves } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

interface RttPanelProps {
  className?: string;
}

export function RttPanel({ className }: RttPanelProps) {
  const { error, viewMode, splitRatio, setSplitRatio, rttConnected, isRunning, lines, chartConfig } =
    useRttStore();

  const workflowHint = !rttConnected
    ? {
        icon: Link,
        title: "先建立 RTT 连接",
        description: "在左侧选择探针和芯片后，先点“连接 RTT”，再启动采集。",
      }
    : !isRunning
      ? {
          icon: Link,
          title: "RTT 已连接，等待启动",
          description: "点击工具栏里的“启动”，开始扫描控制块并接收通道数据。",
        }
      : lines.length === 0
        ? {
            icon: FileText,
            title: "RTT 正在运行，等待目标输出",
            description: "如果固件已经输出数值流，可以稍后直接切到“波形 / FFT”工作流。",
          }
        : chartConfig.enabled
          ? {
              icon: chartConfig.signalDomain === "fft" ? BarChart3 : Waves,
              title: chartConfig.signalDomain === "fft" ? "当前处于 FFT 分析链路" : "当前处于波形分析链路",
              description: "保留文本与图表分屏时，可以同时观察原始日志和时域 / 频域变化。",
            }
          : {
              icon: Waves,
              title: "已经收到数据，可以启用图表",
              description: "点“智能启用”自动识别数据格式，或直接点“波形 / FFT”进入图表视图。",
            };

  // RTT is now independent from main connection
  return (
    <div className={cn("flex h-full flex-col gap-3", className)}>
      {/* 工具栏 */}
      <RttToolbar />

      <PanelHintCard
        icon={workflowHint.icon}
        title={workflowHint.title}
        description={workflowHint.description}
      />

      {/* 错误提示 */}
      {error && (
        <div className="flex items-start gap-2 rounded-[22px] border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">RTT 工作流出现错误</div>
            <div className="mt-1 text-xs leading-5 text-red-500/90">{error}</div>
          </div>
        </div>
      )}

      {/* 数据显示区 */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "text" ? (
          <PanelShell
            title="文本区"
            subtitle="查看原始 RTT 输出、搜索命中和通道日志。"
            badge="Console"
          >
            <RttViewer />
          </PanelShell>
        ) : viewMode === "chart" ? (
          <PanelShell
            title="图表区"
            subtitle="查看波形、FFT 或结构化趋势图。"
            badge={chartConfig.signalDomain === "fft" ? "FFT" : "Chart"}
          >
            <RttChartViewer />
          </PanelShell>
        ) : (
          // 分屏模式
          <Group orientation="vertical">
            <Panel
              defaultSize={splitRatio * 100}
              minSize={20}
              onResize={(panelSize) => setSplitRatio(panelSize.asPercentage / 100)}
            >
              <div className="h-full min-h-0 pb-1">
                <PanelShell
                  title="文本区"
                  subtitle="保留原始 RTT 文本，方便和图表结果对照。"
                  badge="Console"
                >
                  <RttViewer />
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
                  <RttChartViewer />
                </PanelShell>
              </div>
            </Panel>
          </Group>
        )}
      </div>

      {/* 状态栏 */}
      <RttStatusBar />
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
