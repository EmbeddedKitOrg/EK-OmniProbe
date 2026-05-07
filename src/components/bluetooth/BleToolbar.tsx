import { useBluetoothStore } from "@/stores/bluetoothStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Search, FileText, Binary, SplitSquareHorizontal, BarChart3, Waves, Pause, Play } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-button";
import type { SignalDomain } from "@/lib/chartTypes";

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
  } = useBluetoothStore();

  const setSignalDomain = (domain: SignalDomain) => {
    setChartConfig({ ...chartConfig, enabled: true, signalDomain: domain });
    if (viewMode === "text") setViewMode("chart");
  };

  return (
    <div className="flex items-center gap-2 rounded-[22px] border border-border/60 bg-white/72 px-3 py-2 shadow-[0_8px_18px_rgba(73,93,142,0.05)]">
      {/* 视图切换 */}
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-white/65 p-0.5">
        <TooltipWrapper tooltip={<p>仅文本</p>}>
          <Button
            size="sm"
            variant={viewMode === "text" ? "default" : "ghost"}
            className="h-7 gap-1 rounded-full px-2 text-xs"
            onClick={() => setViewMode("text")}
          >
            <FileText className="h-3.5 w-3.5" />
            文本
          </Button>
        </TooltipWrapper>
        <TooltipWrapper tooltip={<p>分屏</p>}>
          <Button
            size="sm"
            variant={viewMode === "split" ? "default" : "ghost"}
            className="h-7 gap-1 rounded-full px-2 text-xs"
            onClick={() => setViewMode("split")}
          >
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
            分屏
          </Button>
        </TooltipWrapper>
        <TooltipWrapper tooltip={<p>仅图表</p>}>
          <Button
            size="sm"
            variant={viewMode === "chart" ? "default" : "ghost"}
            className="h-7 gap-1 rounded-full px-2 text-xs"
            onClick={() => setViewMode("chart")}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            图表
          </Button>
        </TooltipWrapper>
      </div>

      {/* 波形 / FFT 快捷入口 */}
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-white/65 p-0.5">
        <TooltipWrapper tooltip={<p>时域波形</p>}>
          <Button
            size="sm"
            variant={chartConfig.enabled && chartConfig.signalDomain !== "fft" ? "default" : "ghost"}
            className="h-7 gap-1 rounded-full px-2 text-xs"
            onClick={() => setSignalDomain("time")}
          >
            <Waves className="h-3.5 w-3.5" />
            波形
          </Button>
        </TooltipWrapper>
        <TooltipWrapper tooltip={<p>频域 FFT</p>}>
          <Button
            size="sm"
            variant={chartConfig.signalDomain === "fft" ? "default" : "ghost"}
            className="h-7 gap-1 rounded-full px-2 text-xs"
            onClick={() => setSignalDomain("fft")}
          >
            FFT
          </Button>
        </TooltipWrapper>
      </div>

      {/* 分屏方向 */}
      {viewMode === "split" && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 rounded-full px-2 text-xs"
          onClick={() => setSplitOrientation(splitOrientation === "vertical" ? "horizontal" : "vertical")}
        >
          {splitOrientation === "vertical" ? "上下" : "左右"}
        </Button>
      )}

      {/* 搜索 */}
      <div className="relative ml-1 flex-1 min-w-0">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-shortcut-search
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索文本"
          className="h-7 rounded-full pl-7 text-xs"
        />
      </div>

      {/* 文本 / Hex */}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 rounded-full px-2 text-xs"
        onClick={() => setDisplayMode(displayMode === "text" ? "hex" : "text")}
      >
        <Binary className="h-3.5 w-3.5" />
        {displayMode === "hex" ? "HEX" : "Text"}
      </Button>

      {/* 自动滚动 */}
      <Button
        size="sm"
        variant={autoScroll ? "default" : "ghost"}
        className="h-7 gap-1 rounded-full px-2 text-xs"
        onClick={() => setAutoScroll(!autoScroll)}
      >
        {autoScroll ? "滚动开" : "滚动关"}
      </Button>

      {/* 暂停图表 */}
      {viewMode !== "text" && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 rounded-full px-2 text-xs"
          onClick={() => setChartPaused(!chartPaused)}
        >
          {chartPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {chartPaused ? "继续" : "暂停"}
        </Button>
      )}

      {/* 清空 */}
      <TooltipWrapper tooltip={<p>清空文本与图表 (Ctrl+L)</p>}>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 rounded-full px-2 text-xs"
          onClick={() => {
            clearLines();
            clearChartData();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空
        </Button>
      </TooltipWrapper>
    </div>
  );
}
