import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useRttStore, parseRttData } from "@/stores/rttStore";
import type { RttDataEvent, RttStatusEvent, RttLine } from "@/lib/types";
import { parseChartData } from "@/lib/parseChartData";
import { formatBytes } from "@/lib/formatters";

/**
 * 监听 RTT 事件的 Hook
 * 在组件挂载时自动订阅 RTT 数据和状态事件
 */
export function useRttEvents() {
  const {
    addLines,
    addBytes,
    setRunning,
    setError,
    addChartData,
    incrementParseSuccess,
    incrementParseFail,
  } = useRttStore();
  const pendingBufferRef = useRef<Map<number, { text: string; rawData: number[] }>>(new Map());

  // 批量处理缓冲区
  const batchLinesRef = useRef<Omit<RttLine, "id">[]>([]);
  const batchBytesRef = useRef(0);
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 批量更新函数 - 使用 requestAnimationFrame 确保不阻塞渲染
    const flushBatch = () => {
      if (batchLinesRef.current.length > 0) {
        // 批量添加行
        addLines(batchLinesRef.current);
        batchLinesRef.current = [];
      }

      if (batchBytesRef.current > 0) {
        // 批量更新字节数
        addBytes(batchBytesRef.current);
        batchBytesRef.current = 0;
      }

      updateTimerRef.current = null;
    };

    // 调度批量更新 - 使用 requestAnimationFrame 在下一帧更新
    const scheduleBatchUpdate = () => {
      if (updateTimerRef.current === null) {
        updateTimerRef.current = requestAnimationFrame(flushBatch);
      }
    };

    // 监听 RTT 数据事件
    const unlistenData = listen<RttDataEvent>("rtt-data", (event) => {
      // 如果暂停，不处理数据
      if (useRttStore.getState().isPaused) {
        return;
      }

      const { channel, data, timestamp } = event.payload;

      // 累积字节数（不立即更新状态）
      batchBytesRef.current += data.length;

      // 解析数据为文本行
      const lines = parseRttData(data, channel, timestamp, pendingBufferRef.current);

      if (lines.length > 0) {
        // 累积行（不立即更新状态）
        batchLinesRef.current.push(...lines);

        // 如果图表功能启用，尝试解析图表数据（通过 getState() 实时读取，避免闭包捕获旧引用）
        const currentChartConfig = useRttStore.getState().chartConfig;
        if (currentChartConfig.enabled) {
          for (const line of lines) {
            const result = parseChartData(line.text, currentChartConfig);
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

    // 监听 RTT 状态事件
    const unlistenStatus = listen<RttStatusEvent>("rtt-status", (event) => {
      const { running, error } = event.payload;
      setRunning(running);
      if (error) {
        setError(error);
      }
    });

    // 清理
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
    addBytes,
    setRunning,
    setError,
    addChartData,
    incrementParseSuccess,
    incrementParseFail,
  ]);
}

/**
 * 获取 RTT 统计信息
 */
export function useRttStats() {
  const { lines, totalBytes, isRunning } = useRttStore();

  return {
    lineCount: lines.length,
    totalBytes,
    isRunning,
    bytesFormatted: formatBytes(totalBytes),
  };
}

