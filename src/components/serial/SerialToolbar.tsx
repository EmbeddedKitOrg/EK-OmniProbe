import { useSerialStore } from "@/stores/serialStore";
import { useLogStore } from "@/stores/logStore";
import { stopSerial, startSerial, clearSerialBuffer } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Play,
  Square,
  Trash2,
  Download,
  Search,
  FileText,
  SquareTerminal,
  SplitSquareHorizontal,
  BarChart3,
  Waves,
  Sparkles,
  SlidersHorizontal,
  Settings2,
  ArrowDown,
  Clock,
  Columns,
  Binary,
  Tags,
} from "lucide-react";
import { ChartConfigDialog } from "@/components/rtt/ChartConfigDialog";
import { ColorSettingsDialog } from "@/components/rtt/ColorSettingsDialog";
import { detectDataFormat, applyAutoConfig } from "@/lib/chartAutoConfig";
import { exportSerialLinesAsTxt, exportSerialLinesAsCsv } from "@/lib/exporters";
import type { SignalDomain } from "@/lib/chartTypes";
import type { ReactNode } from "react";

export function SerialToolbar() {
  const {
    connected,
    running,
    autoScroll,
    showTimestamp,
    showDirectionPrefix,
    splitByDirection,
    searchQuery,
    displayMode,
    textViewMode,
    terminalSettings,
    viewMode,
    splitOrientation,
    lines,
    chartConfig,
    setRunning,
    setAutoScroll,
    setShowTimestamp,
    setShowDirectionPrefix,
    setSplitByDirection,
    setSearchQuery,
    setDisplayMode,
    setTextViewMode,
    setTerminalSettings,
    setViewMode,
    setSplitOrientation,
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

  const handleExportTxt = async () => {
    const { lines } = useSerialStore.getState();
    if (lines.length === 0) {
      addLog("warn", "没有数据可导出");
      return;
    }
    try {
      const path = await exportSerialLinesAsTxt(lines);
      if (path) addLog("success", `已导出 ${lines.length} 行到 ${path}`);
    } catch (err) {
      addLog("error", `导出失败: ${err}`);
    }
  };

  const handleExportCsv = async () => {
    const { lines } = useSerialStore.getState();
    if (lines.length === 0) {
      addLog("warn", "没有数据可导出");
      return;
    }
    try {
      const path = await exportSerialLinesAsCsv(lines);
      if (path) addLog("success", `已导出 ${lines.length} 行到 ${path}`);
    } catch (err) {
      addLog("error", `导出失败: ${err}`);
    }
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
    <div className="flex flex-wrap items-center gap-2.5 rounded-[24px] border border-border/60 bg-white/72 px-3.5 py-2.5 shadow-[0_10px_24px_rgba(73,93,142,0.08)] backdrop-blur">
      <ToolbarGroup label="采集">
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
          <Button size="sm" variant="destructive" onClick={handleStop} className="gap-1">
            <Square className="h-3.5 w-3.5" />
            停止
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={handleClear} className="gap-1">
          <Trash2 className="h-3.5 w-3.5" />
          清空
        </Button>
      </ToolbarGroup>

      <ToolbarGroup label="查看">
        <div className="flex gap-1">
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
        </div>

        <div className="flex gap-1">
          <Button
            size="sm"
            variant={textViewMode === "log" ? "secondary" : "outline"}
            onClick={() => setTextViewMode("log")}
            className="gap-1"
            title="日志视图"
          >
            <FileText className="h-3.5 w-3.5" />
            日志
          </Button>
          <Button
            size="sm"
            variant={textViewMode === "terminal" ? "secondary" : "outline"}
            onClick={() => setTextViewMode("terminal")}
            className="gap-1"
            title="终端视图"
          >
            <SquareTerminal className="h-3.5 w-3.5" />
            终端
          </Button>
        </div>

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
            title="文本 + 图表分屏"
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

        {viewMode === "split" && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={splitOrientation === "vertical" ? "secondary" : "outline"}
              onClick={() => setSplitOrientation("vertical")}
              className="px-2 text-xs"
              title="上下分屏"
            >
              上下
            </Button>
            <Button
              size="sm"
              variant={splitOrientation === "horizontal" ? "secondary" : "outline"}
              onClick={() => setSplitOrientation("horizontal")}
              className="px-2 text-xs"
              title="左右分屏"
            >
              左右
            </Button>
          </div>
        )}
      </ToolbarGroup>

      <ToolbarGroup label="分析">
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

        <div className="flex gap-1">
          <Button
            size="sm"
            variant={chartConfig.chartType === "waveform" && chartConfig.signalDomain === "time" ? "secondary" : "outline"}
            onClick={() => activateSignalWorkspace("time")}
            className="gap-1"
            title="直接进入波形示波器"
          >
            <Waves className="h-3.5 w-3.5" />
            波形
          </Button>
          <Button
            size="sm"
            variant={chartConfig.chartType === "waveform" && chartConfig.signalDomain === "fft" ? "secondary" : "outline"}
            onClick={() => activateSignalWorkspace("fft")}
            className="gap-1"
            title="直接进入 FFT 频谱"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            FFT
          </Button>
        </div>
      </ToolbarGroup>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {textViewMode === "log" && (
          <div className="relative w-40 sm:w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索串口..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-7 text-xs"
              data-shortcut-search
            />
          </div>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              更多
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[340px] rounded-[24px] border-border/70 p-3">
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-foreground">更多操作</div>
                <div className="text-xs text-muted-foreground">
                  {textViewMode === "terminal"
                    ? "终端会话的本地回显、快捷键拦截和颜色配置统一收在这里。"
                    : "收发分屏、时间戳、显示方式和导出统一收在这里。"}
                </div>
              </div>

              <div className="space-y-2.5 rounded-[20px] border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">
                  查看
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {textViewMode === "log" ? (
                    <>
                      <Button
                        size="sm"
                        variant={showTimestamp ? "secondary" : "outline"}
                        onClick={() => setShowTimestamp(!showTimestamp)}
                        className="gap-1"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        时间戳
                      </Button>
                      <Button
                        size="sm"
                        variant={showDirectionPrefix ? "secondary" : "outline"}
                        onClick={() => setShowDirectionPrefix(!showDirectionPrefix)}
                        className="gap-1"
                      >
                        <Tags className="h-3.5 w-3.5" />
                        RX/TX 前缀
                      </Button>
                      <Button
                        size="sm"
                        variant={splitByDirection ? "secondary" : "outline"}
                        onClick={() => setSplitByDirection(!splitByDirection)}
                        className="gap-1"
                      >
                        <Columns className="h-3.5 w-3.5" />
                        收发分屏
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
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant={terminalSettings.localEcho ? "secondary" : "outline"}
                        onClick={() => setTerminalSettings({ localEcho: !terminalSettings.localEcho })}
                        className="gap-1"
                      >
                        <SquareTerminal className="h-3.5 w-3.5" />
                        本地回显
                      </Button>
                      <Button
                        size="sm"
                        variant={terminalSettings.interceptShortcuts ? "secondary" : "outline"}
                        onClick={() =>
                          setTerminalSettings({
                            interceptShortcuts: !terminalSettings.interceptShortcuts,
                          })
                        }
                        className="gap-1"
                      >
                        <Tags className="h-3.5 w-3.5" />
                        控制键拦截
                      </Button>
                      <Button
                        size="sm"
                        variant={terminalSettings.lineMode ? "secondary" : "outline"}
                        onClick={() =>
                          setTerminalSettings({
                            lineMode: !terminalSettings.lineMode,
                          })
                        }
                        className="gap-1"
                        title="开启后键盘输入先在本地累积，回车整行发送，↑↓ 翻历史"
                      >
                        <SquareTerminal className="h-3.5 w-3.5" />
                        行编辑模式
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 rounded-[20px] border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">
                  配置
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <ChartConfigDialog
                    chartConfig={chartConfig}
                    setChartConfig={setChartConfig}
                    title="串口图表配置"
                    trigger={
                      <Button size="sm" variant="outline" className="gap-1">
                        <Settings2 className="h-3.5 w-3.5" />
                        图表配置
                      </Button>
                    }
                  />
                  <ColorSettingsDialog
                    title="串口颜色标记设置"
                    description="串口终端和 RTT 共用同一套颜色标记语法，可在这里统一调整。"
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
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">
                  输出
                </div>
                <div className="flex flex-wrap gap-2.5">
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

function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-[20px] border border-border/60 bg-white/58 px-2 py-1.5">
      <span className="px-2 text-xs font-medium tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
