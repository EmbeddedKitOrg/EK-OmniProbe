import { useSerialStore } from "@/stores/serialStore";
import { useLogStore } from "@/stores/logStore";
import { stopSerial, startSerial, clearSerialBuffer } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play,
  Square,
  Trash2,
  Download,
  ArrowDown,
  Search,
  FileText,
  Binary,
  SplitSquareHorizontal,
  BarChart3,
  Sparkles,
  Clock,
  Columns,
} from "lucide-react";
import { ChartConfigDialog } from "@/components/rtt/ChartConfigDialog";
import { ColorSettingsDialog } from "@/components/rtt/ColorSettingsDialog";
import { detectDataFormat, applyAutoConfig } from "@/lib/chartAutoConfig";

export function SerialToolbar() {
  const {
    connected,
    running,
    autoScroll,
    showTimestamp,
    splitByDirection,
    searchQuery,
    displayMode,
    viewMode,
    lines,
    chartConfig,
    setRunning,
    setAutoScroll,
    setShowTimestamp,
    setSplitByDirection,
    setSearchQuery,
    setDisplayMode,
    setViewMode,
    clearLines,
    setChartConfig,
  } = useSerialStore();

  const addLog = useLogStore((state) => state.addLog);

  // Start serial polling
  const handleStart = async () => {
    if (!connected) {
      addLog("error", "请先连接串口");
      return;
    }

    try {
      await startSerial(10);
      setRunning(true);
      addLog("info", "串口数据接收已启动");
    } catch (error) {
      addLog("error", `启动失败: ${error}`);
    }
  };

  // Stop serial polling
  const handleStop = async () => {
    try {
      await stopSerial();
      setRunning(false);
      addLog("info", "串口数据接收已停止");
    } catch (error) {
      addLog("error", `停止失败: ${error}`);
    }
  };

  // Clear data
  const handleClear = async () => {
    clearLines();
    try {
      await clearSerialBuffer();
    } catch {
      // Ignore
    }
  };

  // Format timestamp
  const formatTimestamp = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${ms}`;
  };

  // Export to TXT
  const handleExport = () => {
    const { lines } = useSerialStore.getState();
    if (lines.length === 0) {
      addLog("warn", "没有数据可导出");
      return;
    }

    const content = lines
      .map((line) => {
        const time = formatTimestamp(line.timestamp);
        const dir = line.direction === "rx" ? "RX" : "TX";
        return `[${time}] [${dir}] ${line.text}`;
      })
      .join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `serial-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    addLog("success", `已导出 ${lines.length} 行数据`);
  };

  // Smart enable chart
  const handleSmartEnableChart = () => {
    if (lines.length === 0) {
      addLog("warn", "没有数据可分析，请先接收一些数据");
      return;
    }

    // Take last 20 lines as sample
    const sampleSize = Math.min(20, lines.length);
    const sampleLines = lines.slice(-sampleSize).map((line) => line.text);

    // Detect data format
    const result = detectDataFormat(sampleLines);

    if (result.confidence < 0.5) {
      addLog("warn", `无法识别数据格式（置信度: ${(result.confidence * 100).toFixed(0)}%）`);
      addLog("info", "请手动配置图表或确保数据格式正确");
      return;
    }

    // Apply auto config
    const newConfig = applyAutoConfig(chartConfig, result);
    setChartConfig(newConfig);

    // Switch to split or chart view
    if (viewMode === "text") {
      setViewMode("split");
    }

    addLog("success", result.description);
    addLog("info", `已自动配置 ${result.detectedKeys.length} 个数据系列`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[24px] border border-border/60 bg-white/72 px-3 py-2 shadow-[0_10px_24px_rgba(73,93,142,0.08)] backdrop-blur">
      {/* Start/Stop */}
      {!running ? (
        <Button
          size="sm"
          onClick={handleStart}
          disabled={!connected}
          className="gap-1 bg-green-600 hover:bg-green-700 text-white"
        >
          <Play className="h-3.5 w-3.5" />
          开始
        </Button>
      ) : (
        <Button
          size="sm"
          variant="destructive"
          onClick={handleStop}
          className="gap-1"
        >
          <Square className="h-3.5 w-3.5" />
          停止
        </Button>
      )}

      {/* Clear */}
      <Button size="sm" variant="outline" onClick={handleClear} className="gap-1">
        <Trash2 className="h-3.5 w-3.5" />
        清空
      </Button>

      <div className="w-px h-5 bg-border" />

      {/* Auto scroll */}
      <Button
        size="sm"
        variant={autoScroll ? "secondary" : "outline"}
        onClick={() => setAutoScroll(!autoScroll)}
        className="gap-1"
        title="自动滚动到最新数据"
      >
        <ArrowDown className="h-3.5 w-3.5" />
        自动滚动
      </Button>

      {/* Show timestamp toggle */}
      <Button
        size="sm"
        variant={showTimestamp ? "secondary" : "outline"}
        onClick={() => setShowTimestamp(!showTimestamp)}
        className="gap-1"
        title="显示/隐藏时间戳"
      >
        <Clock className="h-3.5 w-3.5" />
        时间戳
      </Button>

      {/* Split by direction toggle */}
      <Button
        size="sm"
        variant={splitByDirection ? "secondary" : "outline"}
        onClick={() => setSplitByDirection(!splitByDirection)}
        className="gap-1"
        title="左右分屏显示收发数据"
      >
        <Columns className="h-3.5 w-3.5" />
        收发分屏
      </Button>

      {/* Display mode toggle */}
      <Button
        size="sm"
        variant={displayMode === "hex" ? "secondary" : "outline"}
        onClick={() => setDisplayMode(displayMode === "text" ? "hex" : "text")}
        className="gap-1"
      >
        {displayMode === "hex" ? (
          <>
            <Binary className="h-3.5 w-3.5" />
            Hex
          </>
        ) : (
          <>
            <FileText className="h-3.5 w-3.5" />
            文本
          </>
        )}
      </Button>

      <div className="w-px h-5 bg-border" />

      {/* View mode toggle */}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={viewMode === "text" ? "secondary" : "outline"}
          onClick={() => setViewMode("text")}
          title="仅文本"
        >
          <FileText className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={viewMode === "split" ? "secondary" : "outline"}
          onClick={() => setViewMode("split")}
          title="分屏显示"
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={viewMode === "chart" ? "secondary" : "outline"}
          onClick={() => setViewMode("chart")}
          title="仅图表"
        >
          <BarChart3 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Smart enable chart */}
      <Button
        size="sm"
        variant={chartConfig.enabled ? "secondary" : "outline"}
        onClick={handleSmartEnableChart}
        disabled={lines.length === 0}
        className="gap-1"
        title="智能检测数据格式并自动配置图表"
      >
        <Sparkles className="h-3.5 w-3.5" />
        智能启用
      </Button>

      {/* Chart config */}
      <ChartConfigDialog
        chartConfig={chartConfig}
        setChartConfig={setChartConfig}
        title="串口图表配置"
      />

      <div className="flex-1" />

      {/* Search */}
      <div className="relative w-48">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="搜索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 pl-7 text-xs"
        />
      </div>

      {/* Export */}
      <Button size="sm" variant="outline" onClick={handleExport} className="gap-1">
        <Download className="h-3.5 w-3.5" />
        导出
      </Button>

      {/* Color settings */}
      <ColorSettingsDialog />
    </div>
  );
}
