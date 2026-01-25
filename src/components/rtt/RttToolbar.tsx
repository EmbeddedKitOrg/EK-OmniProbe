import { useRttStore } from "@/stores/rttStore";
import { useLogStore } from "@/stores/logStore";
import { useProbeStore } from "@/stores/probeStore";
import { useChipStore } from "@/stores/chipStore";
import { startRtt, stopRtt, clearRttBuffer, connectRtt, disconnectRtt, getRttConnectionStatus } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play,
  Square,
  Pause,
  RotateCcw,
  Trash2,
  Download,
  ArrowDown,
  Search,
  FileText,
  Binary,
  Link,
  Unlink,
  SplitSquareHorizontal,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { ColorSettingsDialog } from "./ColorSettingsDialog";
import { ChartConfigDialog } from "./ChartConfigDialog";
import { useEffect } from "react";
import { detectDataFormat, applyAutoConfig } from "@/lib/chartAutoConfig";

export function RttToolbar() {
  const {
    rttConnected,
    rttConnecting,
    isRunning,
    isPaused,
    autoScroll,
    searchQuery: rttSearchQuery, // 重命名避免冲突
    displayMode,
    viewMode,
    scanMode,
    scanAddress,
    pollInterval,
    lines,
    chartConfig,
    setRttConnected,
    setRttConnecting,
    setRunning,
    setPaused,
    setAutoScroll,
    setSearchQuery,
    setDisplayMode,
    setViewMode,
    setChannels,
    clearLines,
    setChartConfig,
  } = useRttStore();

  const addLog = useLogStore((state) => state.addLog);
  const { selectedProbe, selectedChipName, settings } = useProbeStore();
  const { searchQuery: chipSearchQuery } = useChipStore(); // 重命名避免冲突

  // 检查 RTT 连接状态
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await getRttConnectionStatus();
        setRttConnected(status.connected);
      } catch {
        setRttConnected(false);
      }
    };
    checkStatus();
  }, [setRttConnected]);

  // RTT 连接（使用左侧边栏的全局配置）
  const handleRttConnect = async () => {
    if (!selectedProbe) {
      addLog("error", "请先在左侧选择调试探针");
      return;
    }

    // 优先使用 selectedChipName，如果为空则使用 chipSearchQuery（输入框的值）
    const chipName = selectedChipName || chipSearchQuery.trim();

    if (!chipName) {
      addLog("error", "请先在左侧输入目标芯片型号");
      return;
    }

    try {
      setRttConnecting(true);
      addLog("info", `正在连接 RTT (${chipName})...`);

      await connectRtt({
        probe_identifier: selectedProbe.identifier,
        target: chipName,
        interface_type: settings.interfaceType === "SWD" ? "Swd" : "Jtag",
        clock_speed: settings.clockSpeed,
        connect_mode: settings.connectMode === "Normal" ? "Normal" : "UnderReset",
      });

      setRttConnected(true);
      addLog("success", `RTT 连接成功: ${chipName}`);
    } catch (error) {
      addLog("error", `RTT 连接失败: ${error}`);
      setRttConnected(false);
    } finally {
      setRttConnecting(false);
    }
  };

  // RTT 断开
  const handleRttDisconnect = async () => {
    try {
      // 如果 RTT 正在运行，先停止
      if (isRunning) {
        await stopRtt();
        setRunning(false);
      }

      await disconnectRtt();
      setRttConnected(false);
      addLog("info", "RTT 已断开");
    } catch (error) {
      addLog("error", `RTT 断开失败: ${error}`);
    }
  };

  // 启动 RTT
  const handleStart = async () => {
    try {
      console.log("[RTT Toolbar] 开始启动 RTT");
      addLog("info", "正在启动 RTT...");

      const config = await startRtt({
        scan_mode: scanMode,
        address: scanMode === "exact" ? scanAddress : undefined,
        poll_interval: pollInterval,
      });

      console.log("[RTT Toolbar] RTT 启动成功，配置:", config);
      setChannels(config.up_channels, config.down_channels);
      setRunning(true);
      addLog("success", `RTT 已启动，发现 ${config.up_channels.length} 个上行通道`);

      // 显示通道信息
      for (const ch of config.up_channels) {
        addLog("info", `  通道 ${ch.index}: ${ch.name || "(未命名)"} - ${ch.buffer_size} 字节`);
      }
    } catch (error) {
      console.error("[RTT Toolbar] RTT 启动失败:", error);
      addLog("error", `启动 RTT 失败: ${error}`);
      setRunning(false);
    }
  };

  // 停止 RTT
  const handleStop = async () => {
    try {
      console.log("[RTT Toolbar] 开始停止 RTT");
      await stopRtt();
      setRunning(false);
      addLog("info", "RTT 已停止");
      console.log("[RTT Toolbar] RTT 停止成功");
    } catch (error) {
      console.error("[RTT Toolbar] RTT 停止失败:", error);
      addLog("error", `停止 RTT 失败: ${error}`);
    }
  };

  // 暂停/继续
  const handleTogglePause = () => {
    setPaused(!isPaused);
  };

  // 清空
  const handleClear = async () => {
    clearLines();
    try {
      await clearRttBuffer();
    } catch {
      // 忽略错误
    }
  };

  // 格式化时间戳
  const formatTimestamp = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${ms}`;
  };

  // 导出为 TXT
  const handleExport = () => {
    const { lines } = useRttStore.getState();
    if (lines.length === 0) {
      addLog("warn", "没有数据可导出");
      return;
    }

    const content = lines
      .map((line) => {
        const time = formatTimestamp(line.timestamp);
        return `[${time}] [CH${line.channel}] ${line.text}`;
      })
      .join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rtt-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    addLog("success", `已导出 ${lines.length} 行数据`);
  };

  // 智能启用图表
  const handleSmartEnableChart = () => {
    if (lines.length === 0) {
      addLog("warn", "没有数据可分析，请先启动 RTT 并接收一些数据");
      return;
    }

    // 取最近的 20 行数据作为样本
    const sampleSize = Math.min(20, lines.length);
    const sampleLines = lines.slice(-sampleSize).map((line) => line.text);

    // 检测数据格式
    const result = detectDataFormat(sampleLines);

    if (result.confidence < 0.5) {
      addLog("warn", `无法识别数据格式（置信度: ${(result.confidence * 100).toFixed(0)}%）`);
      addLog("info", "请手动配置图表或确保数据格式正确");
      return;
    }

    // 应用自动配置
    const newConfig = applyAutoConfig(chartConfig, result);
    setChartConfig(newConfig);

    // 切换到分屏或图表视图
    if (viewMode === "text") {
      setViewMode("split");
    }

    addLog("success", result.description);
    addLog("info", `已自动配置 ${result.detectedKeys.length} 个数据系列`);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
      {/* RTT 连接/断开按钮 */}
      {!rttConnected ? (
        <Button
          size="sm"
          variant="default"
          onClick={handleRttConnect}
          disabled={rttConnecting}
          className="gap-1"
        >
          <Link className={`h-3.5 w-3.5 ${rttConnecting ? "animate-pulse" : ""}`} />
          {rttConnecting ? "连接中..." : "连接 RTT"}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={handleRttDisconnect}
          className="gap-1 border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-500"
        >
          <Unlink className="h-3.5 w-3.5" />
          断开 RTT
        </Button>
      )}

      <div className="w-px h-5 bg-border" />

      {/* 启动/停止按钮 */}
      {!isRunning ? (
        <Button
          size="sm"
          onClick={handleStart}
          disabled={!rttConnected}
          className="gap-1 bg-green-600 hover:bg-green-700 text-white"
        >
          <Play className="h-3.5 w-3.5" />
          启动
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

      {/* 暂停/继续按钮 */}
      <Button
        size="sm"
        variant="outline"
        onClick={handleTogglePause}
        disabled={!isRunning}
        className="gap-1"
      >
        {isPaused ? (
          <>
            <RotateCcw className="h-3.5 w-3.5" />
            继续
          </>
        ) : (
          <>
            <Pause className="h-3.5 w-3.5" />
            暂停
          </>
        )}
      </Button>

      {/* 清空按钮 */}
      <Button size="sm" variant="outline" onClick={handleClear} className="gap-1">
        <Trash2 className="h-3.5 w-3.5" />
        清空
      </Button>

      <div className="w-px h-5 bg-border" />

      {/* 自动滚动 */}
      <Button
        size="sm"
        variant={autoScroll ? "secondary" : "outline"}
        onClick={() => setAutoScroll(!autoScroll)}
        className="gap-1"
      >
        <ArrowDown className="h-3.5 w-3.5" />
        自动滚动
      </Button>

      {/* 显示模式切换 */}
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

      {/* 视图模式切换 */}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={viewMode === "text" ? "secondary" : "outline"}
          onClick={() => setViewMode("text")}
          className="gap-1"
          title="仅文本"
        >
          <FileText className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={viewMode === "split" ? "secondary" : "outline"}
          onClick={() => setViewMode("split")}
          className="gap-1"
          title="分屏显示"
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={viewMode === "chart" ? "secondary" : "outline"}
          onClick={() => setViewMode("chart")}
          className="gap-1"
          title="仅图表"
        >
          <BarChart3 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* 智能启用图表按钮 */}
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

      {/* 图表配置按钮 */}
      <ChartConfigDialog />

      <div className="flex-1" />

      {/* 搜索框 */}
      <div className="relative w-48">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="搜索..."
          value={rttSearchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 pl-7 text-xs"
        />
      </div>

      {/* 导出按钮 */}
      <Button size="sm" variant="outline" onClick={handleExport} className="gap-1">
        <Download className="h-3.5 w-3.5" />
        导出
      </Button>

      {/* 颜色设置 */}
      <ColorSettingsDialog />
    </div>
  );
}
