import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useRttStore } from "@/stores/rttStore";
import type { RttDataEvent, RttStatusEvent, RttLine } from "@/lib/types";
import type { ChartDataPoint } from "@/lib/chartTypes";
import { parseChartLines } from "@/lib/parseChartData";
import { parseRttData } from "@/lib/dataFraming";
import { formatBytes } from "@/lib/formatters";
import { useShallow } from "zustand/react/shallow";

/**
 * 监听 RTT 事件的 Hook
 * 在组件挂载时自动订阅 RTT 数据和状态事件
 */
export function useRttEvents() {
  const { addLines, addBytes, setRunning, setError, addChartDataBatch, incrementParseCounts } = useRttStore(
    useShallow((state) => ({
      addLines: state.addLines,
      addBytes: state.addBytes,
      setRunning: state.setRunning,
      setError: state.setError,
      addChartDataBatch: state.addChartDataBatch,
      incrementParseCounts: state.incrementParseCounts,
    }))
  );
  const pendingBufferRef = useRef<Map<number, { text: string; rawData: number[] }>>(new Map());

  // 批量处理缓冲区：所有高频更新统一到 requestAnimationFrame 节流
  const batchLinesRef = useRef<Omit<RttLine, "id">[]>([]);
  const batchBytesRef = useRef(0);
  const batchChartPointsRef = useRef<ChartDataPoint[]>([]);
  const batchParseRef = useRef({ success: 0, fail: 0 });
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 批量更新函数 - 在每帧最多触发一次 setState
    const flushBatch = () => {
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

      if (batchBytesRef.current > 0) {
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

      batchBytesRef.current += data.length;

      const lines = parseRttData(data, channel, timestamp, pendingBufferRef.current);

      if (lines.length > 0) {
        batchLinesRef.current.push(...lines);

        // 图表解析：累积到批，flushBatch 时单次 setState
        const currentChartConfig = useRttStore.getState().chartConfig;
        if (currentChartConfig.enabled) {
          const parsed = parseChartLines(lines, currentChartConfig);
          batchChartPointsRef.current.push(...parsed.points);
          batchParseRef.current.success += parsed.success;
          batchParseRef.current.fail += parsed.fail;
        }

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
  }, [addLines, addBytes, setRunning, setError, addChartDataBatch, incrementParseCounts]);
}

/**
 * 获取 RTT 统计信息
 */
export function useRttStats() {
  const { lineCount, totalBytes, isRunning } = useRttStore(
    useShallow((state) => ({
      lineCount: state.lines.length,
      totalBytes: state.totalBytes,
      isRunning: state.isRunning,
    }))
  );

  return {
    lineCount,
    totalBytes,
    isRunning,
    bytesFormatted: formatBytes(totalBytes),
  };
}
