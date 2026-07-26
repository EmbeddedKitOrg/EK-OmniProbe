import { Circle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/formatters";
import { exportSessionFile, importSessionFile } from "@/lib/exporters";
import { getSessionStats, serializeSession, replaySession } from "@/lib/sessionCapture";
import type { SessionSource } from "@/lib/sessionRecord";
import type { ChartConfig } from "@/lib/chartTypes";
import type { RxFramingSettings } from "@/lib/serialTypes";
import type { SerialReceiveResult } from "@/lib/serialReceivePipeline";
import { useLogStore } from "@/stores/logStore";

interface SessionRecordControlsProps {
  source: SessionSource;
  recording: boolean;
  setRecording: (recording: boolean) => void;
  /** 保存时写入会话头的当前配置 */
  getChartConfig: () => ChartConfig;
  /** 仅串口有可配置的接收分帧 */
  getFraming?: () => RxFramingSettings;
  /** 回放前清空现有图表，避免与实时数据混在一起 */
  onBeforeReplay: () => void;
  /** 把回放结果交给对应的 store */
  onReplayed: (result: SerialReceiveResult, chartConfig: ChartConfig) => void;
}

/**
 * 会话录制与回放按钮。三条数据来源共用——录制逻辑本身与来源无关，
 * 差异只在「配置从哪个 store 取」和「结果提交回哪个 store」，故用回调注入。
 */
export function SessionRecordControls({
  source,
  recording,
  setRecording,
  getChartConfig,
  getFraming,
  onBeforeReplay,
  onReplayed,
}: SessionRecordControlsProps) {
  const addLog = useLogStore((state) => state.addLog);

  const handleToggleRecording = async () => {
    if (!recording) {
      setRecording(true);
      addLog("info", "已开始录制会话，停止时可保存为 .ekrec 文件");
      return;
    }

    // 先取统计再关闭：停止会清空录制器
    const stats = getSessionStats(source);
    const chartConfig = getChartConfig();
    const framing = getFraming?.();
    setRecording(false);

    if (stats.empty) {
      addLog("warn", "本次录制没有收到任何数据，未保存");
      return;
    }

    try {
      const path = await exportSessionFile(serializeSession(source, chartConfig, framing), source);
      if (!path) return;
      addLog("success", `会话已保存到 ${path}（${stats.chunkCount} 块 / ${formatBytes(stats.byteCount)}）`);
      if (stats.truncated) {
        addLog("warn", "录制超出容量上限，文件只包含前一部分数据");
      }
    } catch (error) {
      addLog("error", `保存会话失败: ${error}`);
    }
  };

  const handleReplay = async () => {
    try {
      const file = await importSessionFile();
      if (!file) return;

      const { result, header, chunkCount, channels } = replaySession(file.content);
      if (header.source !== source) {
        addLog("warn", `该文件录制自「${header.source}」，正在当前工作台回放，解析配置可能不适用`);
      }

      onBeforeReplay();
      onReplayed(result, header.chartConfig);

      const channelNote = channels.length > 0 ? `，通道 ${channels.join("/")}` : "";
      addLog(
        "success",
        `已回放 ${chunkCount} 个数据块，解析出 ${result.telemetryBatch.points.length} 个数据点${channelNote}` +
          `（录制于 ${header.createdAt}）`
      );
      if (result.telemetryBatch.fail > 0) {
        addLog("warn", `其中 ${result.telemetryBatch.fail} 帧解析失败`);
      }
    } catch (error) {
      addLog("error", `回放会话失败: ${error}`);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant={recording ? "secondary" : "outline"}
        onClick={handleToggleRecording}
        className="gap-1"
        title="录制原始字节流，之后可回放并重新解析"
      >
        <Circle className={cn("h-3.5 w-3.5", recording && "fill-red-500 text-red-500")} />
        {recording ? "停止并保存" : "录制会话"}
      </Button>
      <Button size="sm" variant="outline" onClick={handleReplay} className="gap-1">
        <History className="h-3.5 w-3.5" />
        回放会话
      </Button>
    </>
  );
}
