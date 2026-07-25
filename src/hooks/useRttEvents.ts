import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useRttStore } from "@/stores/rttStore";
import type { RttDataEvent, RttStatusEvent, RttLine } from "@/lib/types";
import { TelemetryIngestionBuffer } from "@/lib/chartIngestion";
import { TEXT_FRAME_IDLE_MS, TextFrameStream } from "@/lib/dataFraming";
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
  const frameStreamsRef = useRef(new Map<number, TextFrameStream>());
  const idleFlushTimersRef = useRef(new Map<number, number>());

  // 批量处理缓冲区：所有高频更新统一到 requestAnimationFrame 节流
  const batchLinesRef = useRef<Omit<RttLine, "id">[]>([]);
  const batchBytesRef = useRef(0);
  const telemetryIngestionRef = useRef(new TelemetryIngestionBuffer());
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 批量更新函数 - 在每帧最多触发一次 setState
    const flushBatch = () => {
      if (batchLinesRef.current.length > 0) {
        addLines(batchLinesRef.current);
        batchLinesRef.current = [];
      }

      const telemetryBatch = telemetryIngestionRef.current.drain();
      if (telemetryBatch.points.length > 0) addChartDataBatch(telemetryBatch.points);
      if (telemetryBatch.success > 0 || telemetryBatch.fail > 0)
        incrementParseCounts(telemetryBatch.success, telemetryBatch.fail);

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

    const queueLines = (lines: Omit<RttLine, "id">[]) => {
      if (lines.length === 0) return;
      batchLinesRef.current.push(...lines);
      const chartConfig = useRttStore.getState().chartConfig;
      if (chartConfig.enabled) telemetryIngestionRef.current.ingestLines(lines, chartConfig);
    };

    const clearIdleFlush = (channel: number) => {
      const timer = idleFlushTimersRef.current.get(channel);
      if (timer !== undefined) window.clearTimeout(timer);
      idleFlushTimersRef.current.delete(channel);
    };

    const flushPendingChannel = (channel: number, schedule = true) => {
      clearIdleFlush(channel);
      const stream = frameStreamsRef.current.get(channel);
      if (!stream) return;
      const lines = stream.flush().map((line) => ({
        channel,
        timestamp: line.timestamp,
        text: line.text,
        level: line.level,
        rawData: line.rawData,
      }));
      queueLines(lines);
      if (schedule && lines.length > 0) scheduleBatchUpdate();
    };

    const scheduleIdleFlush = (channel: number) => {
      clearIdleFlush(channel);
      idleFlushTimersRef.current.set(
        channel,
        window.setTimeout(() => flushPendingChannel(channel), TEXT_FRAME_IDLE_MS)
      );
    };

    // 监听 RTT 数据事件
    const unlistenData = listen<RttDataEvent>("rtt-data", (event) => {
      const { channel, data, timestamp } = event.payload;

      // 如果暂停，不处理数据
      if (useRttStore.getState().isPaused) {
        frameStreamsRef.current.get(channel)?.reset();
        clearIdleFlush(channel);
        return;
      }

      batchBytesRef.current += data.length;
      let stream = frameStreamsRef.current.get(channel);
      if (!stream) {
        stream = new TextFrameStream();
        frameStreamsRef.current.set(channel, stream);
      }
      const lines = stream.ingest(data, timestamp, "rx").map((line) => ({
        channel,
        timestamp: line.timestamp,
        text: line.text,
        level: line.level,
        rawData: line.rawData,
      }));
      queueLines(lines);
      scheduleBatchUpdate();
      scheduleIdleFlush(channel);
    });

    // 监听 RTT 状态事件
    const unlistenStatus = listen<RttStatusEvent>("rtt-status", (event) => {
      const { running, error } = event.payload;
      if (!running) {
        for (const channel of frameStreamsRef.current.keys()) flushPendingChannel(channel, false);
        frameStreamsRef.current.clear();
        scheduleBatchUpdate();
      }
      setRunning(running);
      if (error) {
        setError(error);
      }
    });

    // 清理
    return () => {
      for (const channel of frameStreamsRef.current.keys()) flushPendingChannel(channel, false);
      frameStreamsRef.current.clear();
      for (const timer of idleFlushTimersRef.current.values()) window.clearTimeout(timer);
      idleFlushTimersRef.current.clear();
      if (updateTimerRef.current !== null) {
        cancelAnimationFrame(updateTimerRef.current);
      }
      flushBatch();

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
