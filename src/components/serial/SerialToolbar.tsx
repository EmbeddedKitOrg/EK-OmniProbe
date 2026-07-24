import { useSerialStore } from "@/stores/serialStore";
import { useLogStore } from "@/stores/logStore";
import { stopSerial, startSerial, clearSerialBuffer } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RxFramingMode } from "@/lib/serialTypes";
import {
  Play,
  Square,
  Trash2,
  Download,
  Copy,
  Search,
  FileText,
  SquareTerminal,
  SplitSquareHorizontal,
  BarChart3,
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
import { copyAllLines, formatSerialLineForCopy } from "@/lib/viewerCopy";
import { useShallow } from "zustand/react/shallow";
import { AiBridgeControl, AiSkillLink } from "./AiBridgeControl";
import { useState } from "react";
import { formatTimestamp } from "@/lib/formatters";

const TIMESTAMP_FORMAT_PRESETS = [
  ["YYYY-MM-DD HH:mm:ss.SSS", "年月日 + 时分秒毫秒"],
  ["YYYY-MM-DD HH:mm:ss", "年月日 + 时分秒"],
  ["HH:mm:ss.SSS", "时分秒毫秒"],
  ["HH:mm:ss", "时分秒"],
  ["mm:ss.SSS", "分秒毫秒"],
  ["mm:ss", "分秒"],
] as const;

export function SerialToolbar() {
  const {
    connected,
    running,
    autoScroll,
    showTimestamp,
    timestampFormat,
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
    rxFraming,
    setRxFraming,
    setRunning,
    setAutoScroll,
    setShowTimestamp,
    setTimestampFormat,
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
  } = useSerialStore(
    useShallow((state) => ({
      connected: state.connected,
      running: state.running,
      autoScroll: state.autoScroll,
      showTimestamp: state.showTimestamp,
      timestampFormat: state.timestampFormat,
      showDirectionPrefix: state.showDirectionPrefix,
      splitByDirection: state.splitByDirection,
      searchQuery: state.searchQuery,
      displayMode: state.displayMode,
      textViewMode: state.textViewMode,
      terminalSettings: state.terminalSettings,
      viewMode: state.viewMode,
      splitOrientation: state.splitOrientation,
      lines: state.lines,
      chartConfig: state.chartConfig,
      rxFraming: state.rxFraming,
      setRxFraming: state.setRxFraming,
      setRunning: state.setRunning,
      setAutoScroll: state.setAutoScroll,
      setShowTimestamp: state.setShowTimestamp,
      setTimestampFormat: state.setTimestampFormat,
      setShowDirectionPrefix: state.setShowDirectionPrefix,
      setSplitByDirection: state.setSplitByDirection,
      setSearchQuery: state.setSearchQuery,
      setDisplayMode: state.setDisplayMode,
      setTextViewMode: state.setTextViewMode,
      setTerminalSettings: state.setTerminalSettings,
      setViewMode: state.setViewMode,
      setSplitOrientation: state.setSplitOrientation,
      clearLines: state.clearLines,
      setChartConfig: state.setChartConfig,
    }))
  );

  const addLog = useLogStore((state) => state.addLog);
  const [moreOpen, setMoreOpen] = useState(false);
  const [chartConfigOpen, setChartConfigOpen] = useState(false);

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

  // 复制全部：从数据数组直接生成（不受虚拟滚动卸载影响），与文本区显示一致
  const handleCopyAll = () => {
    const { lines, searchQuery, showTimestamp, showDirectionPrefix, timestampFormat } = useSerialStore.getState();
    const q = searchQuery.trim().toLowerCase();
    const filtered = q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : lines;
    copyAllLines(
      filtered,
      (l) => formatSerialLineForCopy(l, showTimestamp, showDirectionPrefix, timestampFormat),
      addLog
    );
  };

  const handleExportTxt = async () => {
    const { lines, timestampFormat } = useSerialStore.getState();
    if (lines.length === 0) {
      addLog("warn", "没有数据可导出");
      return;
    }
    try {
      const path = await exportSerialLinesAsTxt(lines, timestampFormat);
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

    // 帧头过滤应先于截取，避免低频采样被高频普通日志挤出样本窗口。
    const sampleLines = lines
      .map((line) => line.text)
      .filter((text) => !chartConfig.framePrefix || text.startsWith(chartConfig.framePrefix))
      .slice(-20);

    // Detect data format
    const result = detectDataFormat(sampleLines, chartConfig.framePrefix);

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
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border/60 bg-muted/20 px-2 py-2">
      {!running ? (
        <Button
          size="sm"
          onClick={handleStart}
          disabled={!connected}
          className="gap-1 bg-green-600 text-white hover:bg-green-700"
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

      <div className="mx-1 h-6 w-px bg-border" />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={textViewMode === "log" ? "secondary" : "ghost"}
          onClick={() => setTextViewMode("log")}
          className="gap-1"
        >
          <FileText className="h-3.5 w-3.5" />
          日志
        </Button>
        <Button
          size="sm"
          variant={textViewMode === "terminal" ? "secondary" : "ghost"}
          onClick={() => setTextViewMode("terminal")}
          className="gap-1"
        >
          <SquareTerminal className="h-3.5 w-3.5" />
          终端
        </Button>
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
                <div className="text-xs text-muted-foreground">
                  {textViewMode === "terminal"
                    ? "终端的本地回显、快捷键拦截和颜色配置都在这里。"
                    : "收发分屏、时间戳、显示方式和导出都在这里。"}
                </div>
              </div>

              <div className="space-y-2.5 rounded-[16px] border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">工作流</div>
                <div className="flex flex-wrap gap-2">
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
                  <AiBridgeControl />
                  <AiSkillLink />
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
              </div>

              <div className="space-y-2.5 rounded-[16px] border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">查看</div>
                <div className="flex flex-wrap gap-2.5">
                  <Button
                    size="sm"
                    variant={autoScroll ? "secondary" : "outline"}
                    onClick={() => setAutoScroll(!autoScroll)}
                    className="gap-1"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    自动滚动
                  </Button>
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
                        {displayMode === "hex" ? (
                          <Binary className="h-3.5 w-3.5" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                        {displayMode === "hex" ? "Hex" : "文本"}
                      </Button>
                    </>
                  ) : textViewMode === "terminal" ? (
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
                  ) : null}
                </div>
                {textViewMode === "log" && showTimestamp && (
                  <div className="space-y-2 rounded-xl border border-border/50 bg-background/55 p-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-foreground">时间格式</span>
                      <code className="text-[11px] text-muted-foreground">
                        {formatTimestamp(Date.now(), timestampFormat)}
                      </code>
                    </div>
                    <Select
                      value={
                        TIMESTAMP_FORMAT_PRESETS.some(([value]) => value === timestampFormat)
                          ? timestampFormat
                          : "custom"
                      }
                      onValueChange={(value) => value !== "custom" && setTimestampFormat(value)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMESTAMP_FORMAT_PRESETS.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">自定义</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={timestampFormat}
                      maxLength={80}
                      onChange={(event) => setTimestampFormat(event.target.value)}
                      placeholder="例如 YYYY年MM月DD日 HH:mm:ss.SSS"
                      className="h-8 font-mono text-xs"
                    />
                    <div className="text-[11px] leading-4 text-muted-foreground">
                      可用：YYYY 年、MM 月、DD 日、HH 时、mm 分、ss 秒、SSS 毫秒；留空使用默认格式。
                    </div>
                  </div>
                )}
              </div>

              {textViewMode === "log" && (
                <div className="space-y-2.5 rounded-[16px] border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">接收分帧</div>
                  <Select
                    value={rxFraming.mode}
                    onValueChange={(value) => setRxFraming({ mode: value as RxFramingMode })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">换行（自动 \n / \r\n）</SelectItem>
                      <SelectItem value="lf">换行 LF（\n）</SelectItem>
                      <SelectItem value="crlf">换行 CRLF（\r\n）</SelectItem>
                      <SelectItem value="cr">换行 CR（\r）</SelectItem>
                      <SelectItem value="timeout">空闲超时分帧</SelectItem>
                      <SelectItem value="custom">自定义分隔符</SelectItem>
                    </SelectContent>
                  </Select>

                  {rxFraming.mode === "timeout" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">空闲</span>
                      <Input
                        type="number"
                        min={5}
                        value={rxFraming.idleMs}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setRxFraming({ idleMs: Number.isNaN(n) ? 0 : n });
                        }}
                        className="h-8 w-24 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">ms 后断帧</span>
                    </div>
                  )}

                  {rxFraming.mode === "custom" && (
                    <div className="flex items-center gap-2">
                      <Input
                        value={rxFraming.customDelimiter}
                        onChange={(e) => setRxFraming({ customDelimiter: e.target.value })}
                        placeholder={rxFraming.customIsHex ? "如 0D 0A" : "分隔字符，如 ; 或 #"}
                        className="h-8 flex-1 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        variant={rxFraming.customIsHex ? "secondary" : "outline"}
                        onClick={() => setRxFraming({ customIsHex: !rxFraming.customIsHex })}
                        className="gap-1"
                        title="按十六进制解析分隔符"
                      >
                        <Binary className="h-3.5 w-3.5" />
                        HEX
                      </Button>
                    </div>
                  )}

                  <div className="text-[11px] leading-4 text-muted-foreground">
                    无固定换行的二进制/HEX 请求-应答用「空闲超时」；带特殊帧头帧尾用「自定义」。
                  </div>
                </div>
              )}

              <div className="space-y-2.5 rounded-[16px] border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium tracking-[0.08em] text-muted-foreground">配置</div>
                <div className="flex flex-wrap gap-2.5">
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

              <div className="space-y-2.5 rounded-[16px] border border-border/60 bg-muted/20 p-3">
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
        <ChartConfigDialog
          chartConfig={chartConfig}
          setChartConfig={setChartConfig}
          title="串口图表配置"
          allowJustFloat
          allowDataFilter
          allowParserConfig={false}
          samples={lines
            .filter((line) => line.direction === "rx")
            .slice(-20)
            .map(({ text, rawData }) => ({ text, rawData }))}
          open={chartConfigOpen}
          onOpenChange={setChartConfigOpen}
          trigger={null}
        />
      </div>
    </div>
  );
}
