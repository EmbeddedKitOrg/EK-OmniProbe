import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSerialStore, parseSerialData } from "@/stores/serialStore";
import type { SerialDataEvent, SerialStatusEvent, SerialLine } from "@/lib/serialTypes";
import type { ChartDataPoint } from "@/lib/chartTypes";
import { parseChartData } from "@/lib/parseChartData";
import { formatBytes } from "@/lib/formatters";

/**
 * Hook to listen for serial events
 * Automatically subscribes to serial data and status events on mount
 */
export function useSerialEvents() {
  const {
    addLines,
    updateStats,
    setRunning,
    setConnected,
    setError,
    appendTerminalChunk,
    addChartDataBatch,
    incrementParseCounts,
  } = useSerialStore();

  const pendingBufferRef = useRef<{ text: string; rawData: number[] }>({
    text: "",
    rawData: [],
  });
  const terminalDecoderRef = useRef(new TextDecoder());

  // 批量处理缓冲区：所有高频更新统一到 requestAnimationFrame 节流
  const batchLinesRef = useRef<Omit<SerialLine, "id">[]>([]);
  const batchStatsRef = useRef({ bytes_received: 0, bytes_sent: 0 });
  const batchTerminalTextRef = useRef<string>("");
  const batchChartPointsRef = useRef<ChartDataPoint[]>([]);
  const batchParseRef = useRef({ success: 0, fail: 0 });
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 批量更新函数 - 在每帧最多触发一次 setState
    const flushBatch = () => {
      if (batchTerminalTextRef.current.length > 0) {
        appendTerminalChunk(batchTerminalTextRef.current);
        batchTerminalTextRef.current = "";
      }

      if (batchLinesRef.current.length > 0) {
        addLines(batchLinesRef.current);
        batchLinesRef.current = [];
      }

      if (batchChartPointsRef.current.length > 0) {
        addChartDataBatch(batchChartPointsRef.current);
        batchChartPointsRef.current = [];
      }

      if (batchParseRef.current.success > 0 || batchParseRef.current.fail > 0) {
        incrementParseCounts(batchParseRef.current.success, batchParseRef.current.fail);
        batchParseRef.current = { success: 0, fail: 0 };
      }

      if (batchStatsRef.current.bytes_received > 0 || batchStatsRef.current.bytes_sent > 0) {
        const currentStats = useSerialStore.getState().stats;
        updateStats({
          bytes_received: currentStats.bytes_received + batchStatsRef.current.bytes_received,
          bytes_sent: currentStats.bytes_sent + batchStatsRef.current.bytes_sent,
        });
        batchStatsRef.current = { bytes_received: 0, bytes_sent: 0 };
      }

      updateTimerRef.current = null;
    };

    // 调度批量更新 - 使用 requestAnimationFrame 在下一帧更新
    const scheduleBatchUpdate = () => {
      if (updateTimerRef.current === null) {
        updateTimerRef.current = requestAnimationFrame(flushBatch);
      }
    };

    // Listen for serial data events
    const unlistenData = listen<SerialDataEvent>("serial-data", (event) => {
      const { data, timestamp, direction } = event.payload;

      const terminalText = terminalDecoderRef.current.decode(new Uint8Array(data), { stream: true });
      if (terminalText) {
        batchTerminalTextRef.current += terminalText;
      }

      batchStatsRef.current.bytes_received += data.length;

      // Parse data to lines
      const { lines, pending } = parseSerialData(data, timestamp, direction as "rx" | "tx", pendingBufferRef.current);
      pendingBufferRef.current = pending;

      if (lines.length > 0) {
        batchLinesRef.current.push(...lines);

        // 图表解析：累积到批，flushBatch 时单次 setState
        const currentChartConfig = useSerialStore.getState().chartConfig;
        if (currentChartConfig.enabled) {
          for (const line of lines) {
            const result = parseChartData(line.text, currentChartConfig);
            if (result.success && result.dataPoint) {
              batchChartPointsRef.current.push(result.dataPoint);
              batchParseRef.current.success += 1;
            } else {
              batchParseRef.current.fail += 1;
            }
          }
        }
      }

      // 只要收到数据就调度更新，避免无换行数据时统计不刷新
      scheduleBatchUpdate();
    });

    // Listen for serial status events
    const unlistenStatus = listen<SerialStatusEvent>("serial-status", (event) => {
      const { connected, running, error } = event.payload;
      setConnected(connected);
      setRunning(running);
      if (error) {
        setError(error);
      }
    });

    // Cleanup
    return () => {
      // 清理定时器
      if (updateTimerRef.current !== null) {
        cancelAnimationFrame(updateTimerRef.current);
        flushBatch(); // 确保剩余数据被处理
      }

      unlistenData.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
    };
  }, [
    addLines,
    updateStats,
    setRunning,
    setConnected,
    setError,
    appendTerminalChunk,
    addChartDataBatch,
    incrementParseCounts,
  ]);
}

/**
 * Get serial statistics
 */
export function useSerialStats() {
  const { lines, stats, running, connected } = useSerialStore();

  return {
    lineCount: lines.length,
    bytesReceived: stats.bytes_received,
    bytesSent: stats.bytes_sent,
    running,
    connected,
    bytesReceivedFormatted: formatBytes(stats.bytes_received),
    bytesSentFormatted: formatBytes(stats.bytes_sent),
  };
}
