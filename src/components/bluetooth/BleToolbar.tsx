import { useBluetoothStore } from "@/stores/bluetoothStore";
import { useLogStore } from "@/stores/logStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChartConfigDialog } from "@/components/rtt/ChartConfigDialog";
import { SignalWorkspaceControls } from "@/components/rtt/SignalWorkspaceControls";
import { detectChartConfig } from "@/lib/chartAnalysis";
import {
  Trash2,
  Search,
  FileText,
  Binary,
  SplitSquareHorizontal,
  BarChart3,
  Snowflake,
  Play,
  SlidersHorizontal,
  Sparkles,
  Settings2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useState } from "react";

export function BleToolbar() {
  const {
    autoScroll,
    searchQuery,
    displayMode,
    viewMode,
    splitOrientation,
    chartConfig,
    chartPaused,
    lines,
    setAutoScroll,
    setSearchQuery,
    setDisplayMode,
    setViewMode,
    setSplitOrientation,
    setChartConfig,
    setChartPaused,
    clearLines,
    clearChartData,
  } = useBluetoothStore(
    useShallow((state) => ({
      autoScroll: state.autoScroll,
      searchQuery: state.searchQuery,
      displayMode: state.displayMode,
      viewMode: state.viewMode,
      splitOrientation: state.splitOrientation,
      chartConfig: state.chartConfig,
      chartPaused: state.chartPaused,
      lines: state.lines,
      setAutoScroll: state.setAutoScroll,
      setSearchQuery: state.setSearchQuery,
      setDisplayMode: state.setDisplayMode,
      setViewMode: state.setViewMode,
      setSplitOrientation: state.setSplitOrientation,
      setChartConfig: state.setChartConfig,
      setChartPaused: state.setChartPaused,
      clearLines: state.clearLines,
      clearChartData: state.clearChartData,
    }))
  );

  const addLog = useLogStore((state) => state.addLog);
  const [moreOpen, setMoreOpen] = useState(false);
  const [chartConfigOpen, setChartConfigOpen] = useState(false);

  const handleSmartEnableChart = () => {
    const samples = lines
      .filter(
        (line) => line.direction === "rx" && (!chartConfig.framePrefix || line.text.startsWith(chartConfig.framePrefix))
      )
      .slice(-20);
    if (samples.length === 0) {
      addLog("warn", "没有 BLE 数据可分析，请先接收一些数据");
      return;
    }

    const { config, detection: result } = detectChartConfig(chartConfig, samples);
    if (result.confidence < 0.5) {
      addLog("warn", `无法识别 BLE 数据格式（置信度: ${(result.confidence * 100).toFixed(0)}%）`);
      return;
    }

    setChartConfig(config);
    if (viewMode === "text") setViewMode("split");
    addLog("success", result.description);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border/60 bg-muted/20 px-2 py-2">
      <div className="flex gap-1">
        <Button size="sm" variant={viewMode === "text" ? "secondary" : "ghost"} onClick={() => setViewMode("text")}>
          <FileText className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant={viewMode === "split" ? "secondary" : "ghost"} onClick={() => setViewMode("split")}>
          <SplitSquareHorizontal className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant={viewMode === "chart" ? "secondary" : "ghost"} onClick={() => setViewMode("chart")}>
          <BarChart3 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="relative ml-auto w-40 sm:w-48">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-shortcut-search
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索文本"
          className="h-8 pl-7 text-xs"
        />
      </div>

      <Button
        size="sm"
        variant="outline"
        className="gap-1"
        onClick={() => {
          clearLines();
          clearChartData();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        清空
      </Button>

      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            更多
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="max-h-[calc(100vh-7rem)] w-[340px] overflow-y-auto overscroll-contain rounded-[24px] border-border/70 p-3"
        >
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-foreground">更多操作</div>
              <div className="text-xs text-muted-foreground">分析、布局、显示和配置集中在这里。</div>
            </div>

            <div className="space-y-2.5 rounded-[16px] border border-border/60 bg-muted/20 p-3">
              <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">工作流</div>
              <SignalWorkspaceControls
                chartConfig={chartConfig}
                viewMode={viewMode}
                splitOrientation={splitOrientation}
                setChartConfig={setChartConfig}
                setViewMode={setViewMode}
                setSplitOrientation={setSplitOrientation}
                leadingActions={
                  <Button
                    size="sm"
                    variant={chartConfig.enabled ? "secondary" : "outline"}
                    onClick={handleSmartEnableChart}
                    disabled={lines.length === 0}
                    className="gap-1"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    智能启用
                  </Button>
                }
                onToggle={(domain, closing) =>
                  addLog(
                    "info",
                    closing
                      ? "已收起 BLE 图表，继续在后台解析数据"
                      : domain === "fft"
                        ? "已打开 BLE FFT 频谱"
                        : "已打开 BLE 时域波形"
                  )
                }
              >
                {viewMode !== "text" && (
                  <Button
                    size="sm"
                    variant={chartPaused ? "secondary" : "outline"}
                    onClick={() => setChartPaused(!chartPaused)}
                    className="gap-1"
                  >
                    {chartPaused ? <Play className="h-3.5 w-3.5" /> : <Snowflake className="h-3.5 w-3.5" />}
                    {chartPaused ? "恢复跟随" : "冻结图表"}
                  </Button>
                )}
              </SignalWorkspaceControls>
            </div>

            <div className="space-y-2.5 rounded-[16px] border border-border/60 bg-muted/20 p-3">
              <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">查看</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={displayMode === "hex" ? "secondary" : "outline"}
                  onClick={() => setDisplayMode(displayMode === "text" ? "hex" : "text")}
                  className="gap-1"
                >
                  <Binary className="h-3.5 w-3.5" />
                  {displayMode === "hex" ? "Hex" : "文本"}
                </Button>
                <Button
                  size="sm"
                  variant={autoScroll ? "secondary" : "outline"}
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  自动滚动
                </Button>
              </div>
            </div>

            <div className="space-y-2.5 rounded-[16px] border border-border/60 bg-muted/20 p-3">
              <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">配置</div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setMoreOpen(false);
                  setChartConfigOpen(true);
                }}
              >
                <Settings2 className="h-3.5 w-3.5" />
                图表配置
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <ChartConfigDialog
        chartConfig={chartConfig}
        setChartConfig={setChartConfig}
        title="BLE 图表配置"
        samples={lines
          .filter((line) => line.direction === "rx")
          .slice(-20)
          .map(({ text, rawData }) => ({ text, rawData }))}
        open={chartConfigOpen}
        onOpenChange={setChartConfigOpen}
        trigger={null}
      />
    </div>
  );
}
