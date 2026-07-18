import { useRttStore } from "@/stores/rttStore";
import { useLogStore } from "@/stores/logStore";
import { useProbeStore } from "@/stores/probeStore";
import { useChipStore } from "@/stores/chipStore";
import { startRtt, stopRtt, clearRttBuffer, connectRtt, disconnectRtt, getRttConnectionStatus } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Play,
  Square,
  Pause,
  RotateCcw,
  Trash2,
  Download,
  Copy,
  Search,
  FileText,
  Binary,
  Link,
  Unlink,
  SplitSquareHorizontal,
  BarChart3,
  Waves,
  Sparkles,
  SlidersHorizontal,
  Settings2,
} from "lucide-react";
import { ColorSettingsDialog } from "./ColorSettingsDialog";
import { ChartConfigDialog } from "./ChartConfigDialog";
import { RttIntegrationGuideDialog } from "./RttIntegrationGuideDialog";
import { useEffect } from "react";
import { detectDataFormat, applyAutoConfig } from "@/lib/chartAutoConfig";
import { exportRttLinesAsTxt, exportRttLinesAsCsv } from "@/lib/exporters";
import { copyAllLines, formatRttLineForCopy } from "@/lib/viewerCopy";
import type { SignalDomain } from "@/lib/chartTypes";
import { useShallow } from "zustand/react/shallow";

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
    splitOrientation,
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
    setSplitOrientation,
    setChannels,
    clearLines,
    setChartConfig,
  } = useRttStore(
    useShallow((state) => ({
      rttConnected: state.rttConnected,
      rttConnecting: state.rttConnecting,
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      autoScroll: state.autoScroll,
      searchQuery: state.searchQuery,
      displayMode: state.displayMode,
      viewMode: state.viewMode,
      splitOrientation: state.splitOrientation,
      scanMode: state.scanMode,
      scanAddress: state.scanAddress,
      pollInterval: state.pollInterval,
      lines: state.lines,
      chartConfig: state.chartConfig,
      setRttConnected: state.setRttConnected,
      setRttConnecting: state.setRttConnecting,
      setRunning: state.setRunning,
      setPaused: state.setPaused,
      setAutoScroll: state.setAutoScroll,
      setSearchQuery: state.setSearchQuery,
      setDisplayMode: state.setDisplayMode,
      setViewMode: state.setViewMode,
      setSplitOrientation: state.setSplitOrientation,
      setChannels: state.setChannels,
      clearLines: state.clearLines,
      setChartConfig: state.setChartConfig,
    }))
  );

  const addLog = useLogStore((state) => state.addLog);
  const { selectedProbe, selectedChipName, settings } = useProbeStore(
    useShallow((state) => ({
      selectedProbe: state.selectedProbe,
      selectedChipName: state.selectedChipName,
      settings: state.settings,
    }))
  );
  const chipSearchQuery = useChipStore((state) => state.searchQuery);

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

  // RTT 连接（使用右侧配置检查器的全局配置）
  const handleRttConnect = async () => {
    if (!selectedProbe) {
      addLog("error", "请先在右侧配置检查器选择调试探针");
      return;
    }

    // 优先使用 selectedChipName，如果为空则使用 chipSearchQuery（输入框的值）
    const chipName = selectedChipName || chipSearchQuery.trim();

    if (!chipName) {
      addLog("error", "请先在右侧配置检查器输入目标芯片型号");
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
      addLog("info", "正在启动 RTT...");

      const config = await startRtt({
        scan_mode: scanMode,
        address: scanMode === "exact" ? scanAddress : undefined,
        poll_interval: pollInterval,
      });

      setChannels(config.up_channels, config.down_channels);
      setRunning(true);
      addLog("success", `RTT 已启动，发现 ${config.up_channels.length} 个上行通道`);

      // 显示通道信息
      for (const ch of config.up_channels) {
        addLog("info", `  通道 ${ch.index}: ${ch.name || "(未命名)"} - ${ch.buffer_size} 字节`);
      }
    } catch (error) {
      addLog("error", `启动 RTT 失败: ${error}`);
      setRunning(false);
    }
  };

  // 停止 RTT
  const handleStop = async () => {
    try {
      await stopRtt();
      setRunning(false);
      addLog("info", "RTT 已停止");
    } catch (error) {
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

  const handleExportTxt = async () => {
    const { lines } = useRttStore.getState();
    if (lines.length === 0) {
      addLog("warn", "没有数据可导出");
      return;
    }
    try {
      const path = await exportRttLinesAsTxt(lines);
      if (path) addLog("success", `已导出 ${lines.length} 行到 ${path}`);
    } catch (err) {
      addLog("error", `导出失败: ${err}`);
    }
  };

  const handleExportCsv = async () => {
    const { lines } = useRttStore.getState();
    if (lines.length === 0) {
      addLog("warn", "没有数据可导出");
      return;
    }
    try {
      const path = await exportRttLinesAsCsv(lines);
      if (path) addLog("success", `已导出 ${lines.length} 行到 ${path}`);
    } catch (err) {
      addLog("error", `导出失败: ${err}`);
    }
  };

  // 复制全部：从数据数组直接生成（不受虚拟滚动卸载影响），与文本区显示的过滤结果一致
  const handleCopyAll = () => {
    const { lines, selectedChannel, searchQuery, showTimestamp } = useRttStore.getState();
    let filtered = lines;
    if (selectedChannel >= 0) filtered = filtered.filter((l) => l.channel === selectedChannel);
    const q = searchQuery.trim().toLowerCase();
    if (q) filtered = filtered.filter((l) => l.text.toLowerCase().includes(q));
    copyAllLines(filtered, (l) => formatRttLineForCopy(l, showTimestamp), addLog);
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

  const activateSignalWorkspace = (domain: SignalDomain) => {
    setChartConfig({
      ...chartConfig,
      enabled: true,
      chartType: "waveform",
      signalDomain: domain,
    });

    if (viewMode === "text") {
      setViewMode("split");
    }

    addLog("info", domain === "fft" ? "已切换到 FFT 频谱工作流" : "已切换到波形示波器工作流");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border/60 bg-muted/20 px-2 py-2">
      {!rttConnected ? (
        <Button size="sm" variant="default" onClick={handleRttConnect} disabled={rttConnecting} className="gap-1">
          <Link className={rttConnecting ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"} />
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

      {!isRunning ? (
        <Button
          size="sm"
          onClick={handleStart}
          disabled={!rttConnected}
          className="gap-1 bg-green-600 text-white hover:bg-green-700"
        >
          <Play className="h-3.5 w-3.5" />
          启动
        </Button>
      ) : (
        <Button size="sm" variant="destructive" onClick={handleStop} className="gap-1">
          <Square className="h-3.5 w-3.5" />
          停止
        </Button>
      )}

      <Button size="sm" variant="outline" onClick={handleTogglePause} disabled={!isRunning} className="gap-1">
        {isPaused ? <RotateCcw className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        {isPaused ? "继续" : "暂停"}
      </Button>

      <Button size="sm" variant="outline" onClick={handleClear} className="gap-1">
        <Trash2 className="h-3.5 w-3.5" />
        清空
      </Button>

      <div className="mx-1 h-6 w-px bg-border" />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={viewMode === "text" ? "secondary" : "ghost"}
          onClick={() => setViewMode("text")}
          title="仅文本"
        >
          <FileText className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={viewMode === "split" ? "secondary" : "ghost"}
          onClick={() => setViewMode("split")}
          title="文本 + 图表分屏"
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={viewMode === "chart" ? "secondary" : "ghost"}
          onClick={() => setViewMode("chart")}
          title="仅图表"
        >
          <BarChart3 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="relative w-40 sm:w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索 RTT..."
            value={rttSearchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-7 text-xs"
            data-shortcut-search
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              更多
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[320px] rounded-[24px] border-border/70 p-3">
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-foreground">更多操作</div>
                <div className="text-xs text-muted-foreground">分析、显示、配置和导出都在这里。</div>
              </div>

              <div className="space-y-2.5 rounded-[12px] border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">工作流</div>
                <div className="flex flex-wrap gap-2">
                  <RttIntegrationGuideDialog />
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
                  <Button size="sm" variant="outline" onClick={() => activateSignalWorkspace("time")} className="gap-1">
                    <Waves className="h-3.5 w-3.5" />
                    波形
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => activateSignalWorkspace("fft")} className="gap-1">
                    <BarChart3 className="h-3.5 w-3.5" />
                    FFT
                  </Button>
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

              <div className="space-y-2.5 rounded-[20px] border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">查看</div>
                <div className="flex flex-wrap gap-2.5">
                  <Button
                    size="sm"
                    variant={autoScroll ? "secondary" : "outline"}
                    onClick={() => setAutoScroll(!autoScroll)}
                    className="gap-1"
                  >
                    自动滚动
                  </Button>
                  <Button
                    size="sm"
                    variant={displayMode === "hex" ? "secondary" : "outline"}
                    onClick={() => setDisplayMode(displayMode === "text" ? "hex" : "text")}
                    className="gap-1"
                  >
                    {displayMode === "hex" ? <Binary className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                    {displayMode === "hex" ? "Hex" : "文本"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2.5 rounded-[20px] border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">配置</div>
                <div className="flex flex-wrap gap-2.5">
                  <ChartConfigDialog
                    chartConfig={chartConfig}
                    setChartConfig={setChartConfig}
                    title="RTT 图表配置"
                    trigger={
                      <Button size="sm" variant="outline" className="gap-1">
                        <Settings2 className="h-3.5 w-3.5" />
                        图表配置
                      </Button>
                    }
                  />
                  <ColorSettingsDialog
                    trigger={
                      <Button size="sm" variant="outline" className="gap-1">
                        <Settings2 className="h-3.5 w-3.5" />
                        颜色设置
                      </Button>
                    }
                  />
                </div>
              </div>

              <div className="space-y-2.5 rounded-[20px] border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">输出</div>
                <div className="flex flex-wrap gap-2.5">
                  <Button size="sm" variant="outline" onClick={handleCopyAll} className="gap-1">
                    <Copy className="h-3.5 w-3.5" />
                    复制全部
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleExportTxt} className="gap-1">
                    <Download className="h-3.5 w-3.5" />
                    导出 TXT
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleExportCsv} className="gap-1">
                    <Download className="h-3.5 w-3.5" />
                    导出 CSV
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
