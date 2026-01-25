import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSerialStore, parseSerialData } from "@/stores/serialStore";
import type { SerialDataEvent, SerialStatusEvent } from "@/lib/serialTypes";
import { parseChartData } from "@/lib/parseChartData";

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
    addChartData,
    chartConfig,
    incrementParseSuccess,
    incrementParseFail,
  } = useSerialStore();

  const pendingBufferRef = useRef<{ text: string; rawData: number[] }>({
    text: "",
    rawData: [],
  });

  // 批量处理缓冲区
  const batchLinesRef = useRef<any[]>([]);
  const batchStatsRef = useRef({ bytes_received: 0, bytes_sent: 0 });
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 批量更新函数 - 使用 requestAnimationFrame 确保不阻塞渲染
    const flushBatch = () => {
      if (batchLinesRef.current.length > 0) {
        // 批量添加行
        addLines(batchLinesRef.current);
        batchLinesRef.current = [];
      }

      if (batchStatsRef.current.bytes_received > 0 || batchStatsRef.current.bytes_sent > 0) {
        // 批量更新统计
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

      // 累积统计信息（不立即更新状态）
      batchStatsRef.current.bytes_received += data.length;

      // Parse data to lines
      const { lines, pending } = parseSerialData(
        data,
        timestamp,
        direction as "rx" | "tx",
        pendingBufferRef.current
      );
      pendingBufferRef.current = pending;

      if (lines.length > 0) {
        // 累积行（不立即更新状态）
        batchLinesRef.current.push(...lines);

        // If chart is enabled, try to parse chart data
        if (chartConfig.enabled) {
          for (const line of lines) {
            const result = parseChartData(line.text, chartConfig);
            if (result.success && result.dataPoint) {
              addChartData(result.dataPoint);
              incrementParseSuccess();
            } else {
              incrementParseFail();
            }
          }
        }

        // 调度批量更新
        scheduleBatchUpdate();
      }
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
    addChartData,
    chartConfig,
    incrementParseSuccess,
    incrementParseFail,
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

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
