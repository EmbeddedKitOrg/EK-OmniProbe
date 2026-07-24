import { useRttStore } from "@/stores/rttStore";
import { RttToolbar } from "./RttToolbar";
import { RttViewer } from "./RttViewer";
import { RttStatusBar } from "./RttStatusBar";
import { RttChartViewer } from "./RttChartViewer";
import { Panel, Group, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import { AlertCircle, FileText, Link } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useChartWorkspaceControls } from "@/hooks/useChartWorkspaceHost";
import { useShallow } from "zustand/react/shallow";
import { ChartDetachedPlaceholder, ChartWindowActions } from "./ChartWindowControls";

interface RttPanelProps {
  className?: string;
}

export function RttPanel({ className }: RttPanelProps) {
  const { error, viewMode, splitRatio, splitOrientation, setSplitRatio, rttConnected, isRunning, lines, chartConfig } =
    useRttStore(
      useShallow((state) => ({
        error: state.error,
        viewMode: state.viewMode,
        splitRatio: state.splitRatio,
        splitOrientation: state.splitOrientation,
        setSplitRatio: state.setSplitRatio,
        rttConnected: state.rttConnected,
        isRunning: state.isRunning,
        lines: state.lines,
        chartConfig: state.chartConfig,
      }))
    );
  const isVerticalSplit = splitOrientation === "vertical";

  const {
    detached: chartDetached,
    openDetachedWindow,
    focusDetachedWindow,
    restoreInline,
  } = useChartWorkspaceControls("rtt");

  const workflowHint = !rttConnected
    ? {
        icon: Link,
        title: "先建立 RTT 连接",
        description: "在右侧配置检查器选择探针和芯片后，先点“连接 RTT”，再启动采集。",
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
            description: "如果固件已经在输出数值流，可以直接切到「波形 / FFT」查看图表。",
          }
        : null;

  // RTT is now independent from main connection
  return (
    <div className={cn("flex h-full flex-col gap-2", className)}>
      {/* 工具栏 */}
      <RttToolbar />

      {workflowHint && (
        <PanelHintCard icon={workflowHint.icon} title={workflowHint.title} description={workflowHint.description} />
      )}

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
          <PanelShell title="文本区" subtitle="原始 RTT 输出。" badge="Console">
            <RttViewer />
          </PanelShell>
        ) : viewMode === "chart" ? (
          <PanelShell
            title="图表区"
            subtitle="波形、FFT 与趋势图。"
            badge={chartConfig.signalDomain === "fft" ? "FFT" : "Chart"}
            actions={
              <ChartWindowActions
                detached={chartDetached}
                onDetach={openDetachedWindow}
                onFocus={focusDetachedWindow}
                onRestore={restoreInline}
              />
            }
          >
            {chartDetached ? (
              <ChartDetachedPlaceholder onFocus={focusDetachedWindow} onRestore={restoreInline} />
            ) : (
              <RttChartViewer />
            )}
          </PanelShell>
        ) : (
          // 分屏模式
          <Group orientation={splitOrientation}>
            <Panel
              defaultSize={splitRatio * 100}
              minSize={20}
              onResize={(panelSize) => setSplitRatio(panelSize.asPercentage / 100)}
            >
              <div className={cn("h-full min-h-0", isVerticalSplit ? "pb-1" : "pr-1")}>
                <PanelShell title="文本区" subtitle="原始 RTT 输出。" badge="Console">
                  <RttViewer />
                </PanelShell>
              </div>
            </Panel>
            <Separator
              className={cn("bg-border hover:bg-primary/50 transition-colors", isVerticalSplit ? "h-1" : "w-1")}
            />
            <Panel defaultSize={(1 - splitRatio) * 100} minSize={20}>
              <div className={cn("h-full min-h-0", isVerticalSplit ? "pt-1" : "pl-1")}>
                <PanelShell
                  title="图表区"
                  subtitle="波形、FFT 与趋势图。"
                  badge={chartConfig.signalDomain === "fft" ? "FFT" : "Chart"}
                  actions={
                    <ChartWindowActions
                      detached={chartDetached}
                      onDetach={openDetachedWindow}
                      onFocus={focusDetachedWindow}
                      onRestore={restoreInline}
                    />
                  }
                >
                  {chartDetached ? (
                    <ChartDetachedPlaceholder onFocus={focusDetachedWindow} onRestore={restoreInline} />
                  ) : (
                    <RttChartViewer />
                  )}
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
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">{description}</span>
    </div>
  );
}

interface PanelShellProps {
  title: string;
  subtitle: string;
  badge: string;
  actions?: ReactNode;
  children: ReactNode;
}

function PanelShell({ title, subtitle, badge, actions, children }: PanelShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/60 bg-white/75 shadow-[0_12px_26px_rgba(73,93,142,0.08)] backdrop-blur">
      <div className="panel-shell-header flex items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="panel-shell-subtitle text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            {badge}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
