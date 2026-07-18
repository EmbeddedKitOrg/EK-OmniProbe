import { useBluetoothStore } from "@/stores/bluetoothStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Trash2,
  Search,
  FileText,
  Binary,
  SplitSquareHorizontal,
  BarChart3,
  Waves,
  Pause,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import type { SignalDomain } from "@/lib/chartTypes";
import { useShallow } from "zustand/react/shallow";

export function BleToolbar() {
  const {
    autoScroll,
    searchQuery,
    displayMode,
    viewMode,
    splitOrientation,
    chartConfig,
    chartPaused,
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

  const setSignalDomain = (domain: SignalDomain) => {
    setChartConfig({ ...chartConfig, enabled: true, signalDomain: domain });
    if (viewMode === "text") setViewMode("chart");
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

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            更多
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[300px] rounded-[14px] border-border/70 p-3">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-foreground">更多操作</div>
              <div className="text-xs text-muted-foreground">分析和显示选项集中在这里。</div>
            </div>

            <div className="space-y-2.5 rounded-[12px] border border-border/60 bg-muted/20 p-3">
              <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">分析</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setSignalDomain("time")} className="gap-1">
                  <Waves className="h-3.5 w-3.5" />
                  波形
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSignalDomain("fft")} className="gap-1">
                  <BarChart3 className="h-3.5 w-3.5" />
                  FFT
                </Button>
                {viewMode !== "text" && (
                  <Button size="sm" variant="outline" onClick={() => setChartPaused(!chartPaused)} className="gap-1">
                    {chartPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    {chartPaused ? "继续" : "暂停"}
                  </Button>
                )}
              </div>
              {viewMode === "split" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={splitOrientation === "vertical" ? "secondary" : "outline"}
                    onClick={() => setSplitOrientation("vertical")}
                  >
                    上下分屏
                  </Button>
                  <Button
                    size="sm"
                    variant={splitOrientation === "horizontal" ? "secondary" : "outline"}
                    onClick={() => setSplitOrientation("horizontal")}
                  >
                    左右分屏
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2.5 rounded-[12px] border border-border/60 bg-muted/20 p-3">
              <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">显示</div>
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
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
