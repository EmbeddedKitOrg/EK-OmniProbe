import type { ReactNode } from "react";
import { BarChart3, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChartConfig, SignalDomain, SplitOrientation, ViewMode } from "@/lib/chartTypes";
import { getSignalWorkspaceTransition, isSignalWorkspaceActive } from "@/lib/chartTypes";

interface SignalWorkspaceControlsProps {
  chartConfig: ChartConfig;
  viewMode: ViewMode;
  splitOrientation: SplitOrientation;
  setChartConfig: (config: ChartConfig) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSplitOrientation: (orientation: SplitOrientation) => void;
  leadingActions?: ReactNode;
  children?: ReactNode;
  onToggle?: (domain: SignalDomain, closing: boolean) => void;
}

export function SignalWorkspaceControls({
  chartConfig,
  viewMode,
  splitOrientation,
  setChartConfig,
  setViewMode,
  setSplitOrientation,
  leadingActions,
  children,
  onToggle,
}: SignalWorkspaceControlsProps) {
  const toggleDomain = (domain: SignalDomain) => {
    const closing = isSignalWorkspaceActive(viewMode, chartConfig, domain);
    const next = getSignalWorkspaceTransition(viewMode, chartConfig, domain);
    if (next.chartConfig !== chartConfig) setChartConfig(next.chartConfig);
    if (next.viewMode !== viewMode) setViewMode(next.viewMode);
    onToggle?.(domain, closing);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {leadingActions}
        {(["time", "fft"] as const).map((domain) => {
          const active = isSignalWorkspaceActive(viewMode, chartConfig, domain);
          const isFft = domain === "fft";
          return (
            <Button
              key={domain}
              size="sm"
              variant={active ? "secondary" : "outline"}
              onClick={() => toggleDomain(domain)}
              className="gap-1"
              aria-pressed={active}
              title={active ? `再次点击收起${isFft ? " FFT" : "波形"}图表` : `打开${isFft ? " FFT" : "波形"}图表`}
            >
              {isFft ? <BarChart3 className="h-3.5 w-3.5" /> : <Waves className="h-3.5 w-3.5" />}
              {isFft ? "FFT" : "波形"}
            </Button>
          );
        })}
        {children}
      </div>

      {viewMode === "split" && (
        <div className="grid grid-cols-2 gap-1 rounded-[12px] border border-border/50 bg-background/40 p-1">
          <Button
            size="sm"
            variant={splitOrientation === "vertical" ? "secondary" : "ghost"}
            onClick={() => setSplitOrientation("vertical")}
            className="h-8"
          >
            上下分屏
          </Button>
          <Button
            size="sm"
            variant={splitOrientation === "horizontal" ? "secondary" : "ghost"}
            onClick={() => setSplitOrientation("horizontal")}
            className="h-8"
          >
            左右分屏
          </Button>
        </div>
      )}
    </>
  );
}
