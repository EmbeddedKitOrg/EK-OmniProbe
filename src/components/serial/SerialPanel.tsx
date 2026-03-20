import { useSerialStore } from "@/stores/serialStore";
import { SerialToolbar } from "./SerialToolbar";
import { SerialViewer } from "./SerialViewer";
import { SerialSendBar } from "./SerialSendBar";
import { ChartViewer } from "@/components/rtt/ChartViewer";
import { Panel, Group, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";

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
  const { error, viewMode, splitRatio, setSplitRatio, splitByDirection } = useSerialStore();

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <SerialToolbar />

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-red-500 text-xs">
          {error}
        </div>
      )}

      {/* Data display area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "text" ? (
          // Text only mode - respect splitByDirection
          <TerminalSection splitByDirection={splitByDirection} />
        ) : viewMode === "chart" ? (
          // Chart only mode
          <SerialChartViewer />
        ) : (
          // Split mode (terminal + chart) - terminal section respects splitByDirection
          <Group orientation="vertical">
            <Panel
              defaultSize={splitRatio * 100}
              minSize={20}
              onResize={(panelSize) => setSplitRatio(panelSize.asPercentage / 100)}
            >
              <TerminalSection splitByDirection={splitByDirection} />
            </Panel>
            <Separator className="h-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={(1 - splitRatio) * 100} minSize={20}>
              <SerialChartViewer />
            </Panel>
          </Group>
        )}
      </div>

      {/* Send bar */}
      <SerialSendBar />
    </div>
  );
}
