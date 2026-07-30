import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useRttStore } from "@/stores/rttStore";
import type { RttDataEvent, RttStatusEvent, RttLine } from "@/lib/types";
import { TelemetryIngestionBuffer, TelemetryParseDispatcher } from "@/lib/chartIngestion";
import { TEXT_FRAME_IDLE_MS, TextFrameStream } from "@/lib/dataFraming";
import { getChartParser } from "@/lib/parseChartData";
import { captureSessionChunk } from "@/lib/sessionCapture";
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
  // 字节流解析按通道各持一份：不同 RTT 通道的二进制残包不能互相污染
  const parseDispatchersRef = useRef(new Map<number, TelemetryParseDispatcher>());

  // 批量处理缓冲区：所有高频更新统一到 requestAnimationFrame 节流
  const batchLinesRef = useRef<Omit<RttLine, "id">[]>([]);
  const batchBytesRef = useRef(0);
  const telemetryIngestionRef = useRef(new TelemetryIngestionBuffer());
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const frameStreams = frameStreamsRef.current;
    const idleFlushTimers = idleFlushTimersRef.current;
    const parseDispatchers = parseDispatchersRef.current;
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
      // 字节流模式下文本行只用于日志显示，遥测数值由 ingestChannelBytes 产出
      if (chartConfig.enabled && getChartParser(chartConfig.parseMode)?.kind !== "bytes") {
        telemetryIngestionRef.current.ingestLines(lines, chartConfig);
      }
    };

    /** 字节流解析：仅在选用字节流解析器时有产出，返回是否已消费。 */
    const ingestChannelBytes = (channel: number, data: number[], timestamp: number) => {
      const chartConfig = useRttStore.getState().chartConfig;
      let dispatcher = parseDispatchers.get(channel);
      if (!dispatcher) {
        dispatcher = new TelemetryParseDispatcher();
        parseDispatchers.set(channel, dispatcher);
      }
      const parsed = dispatcher.ingestBytes(data, chartConfig, timestamp);
      if (!parsed) return;

      if (parsed.detectedChannels) {
        useRttStore.getState().setChartConfig({ ...chartConfig, channels: parsed.detectedChannels });
      }
      telemetryIngestionRef.current.ingestBatch({
        points: parsed.points,
        success: parsed.success,
        fail: parsed.fail,
      });
    };

    const clearIdleFlush = (channel: number) => {
      const timer = idleFlushTimers.get(channel);
      if (timer !== undefined) window.clearTimeout(timer);
      idleFlushTimers.delete(channel);
    };

    const flushPendingChannel = (channel: number, schedule = true) => {
      clearIdleFlush(channel);
      const stream = frameStreams.get(channel);
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
      // 超时分帧模式下，空闲时长由用户配置决定；其余模式用固定兜底值刷出无换行残帧
      const framing = useRttStore.getState().rxFraming;
      const delay = framing.mode === "timeout" ? Math.max(5, framing.idleMs) : TEXT_FRAME_IDLE_MS;
      idleFlushTimers.set(
        channel,
        window.setTimeout(() => flushPendingChannel(channel), delay)
      );
    };

    // 监听 RTT 数据事件
    const unlistenData = listen<RttDataEvent>("rtt-data", (event) => {
      const { channel, data, timestamp } = event.payload;

      // 如果暂停，不处理数据
      if (useRttStore.getState().isPaused) {
        frameStreams.get(channel)?.reset();
        parseDispatchers.get(channel)?.reset();
        clearIdleFlush(channel);
        return;
      }

      batchBytesRef.current += data.length;

      // 录制原始字节，带上通道号——回放时必须按通道分别拼帧
      if (useRttStore.getState().sessionRecording) {
        captureSessionChunk("rtt", data, timestamp, channel);
      }

      ingestChannelBytes(channel, data, timestamp);

      let stream = frameStreams.get(channel);
      if (!stream) {
        stream = new TextFrameStream();
        frameStreams.set(channel, stream);
      }
      const lines = stream.ingest(data, timestamp, "rx", useRttStore.getState().rxFraming).map((line) => ({
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
        for (const channel of frameStreams.keys()) flushPendingChannel(channel, false);
        frameStreams.clear();
        for (const dispatcher of parseDispatchers.values()) dispatcher.reset();
        parseDispatchers.clear();
        scheduleBatchUpdate();
      }
      setRunning(running);
      if (error) {
        setError(error);
      }
    });

    // 清理
    return () => {
      for (const channel of frameStreams.keys()) flushPendingChannel(channel, false);
      frameStreams.clear();
      for (const timer of idleFlushTimers.values()) window.clearTimeout(timer);
      idleFlushTimers.clear();
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
