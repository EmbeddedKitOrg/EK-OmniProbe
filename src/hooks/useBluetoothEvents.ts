import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBluetoothStore } from "@/stores/bluetoothStore";
import { TEXT_FRAME_IDLE_MS, TextFrameStream } from "@/lib/dataFraming";
import type { BleDataEvent, BleStatusEvent, BleLine } from "@/lib/bleTypes";
import { TelemetryIngestionBuffer, TelemetryParseDispatcher } from "@/lib/chartIngestion";
import { getChartParser } from "@/lib/parseChartData";
import { formatBytes } from "@/lib/formatters";
import { useShallow } from "zustand/react/shallow";

/**
 * 监听 BLE 后端事件，复用 serial 的解析与批量更新模式。
 */
export function useBluetoothEvents() {
  const { addLines, updateStats, setRunning, setConnected, setError, addChartDataBatch, incrementParseCounts } =
    useBluetoothStore(
      useShallow((state) => ({
        addLines: state.addLines,
        updateStats: state.updateStats,
        setRunning: state.setRunning,
        setConnected: state.setConnected,
        setError: state.setError,
        addChartDataBatch: state.addChartDataBatch,
        incrementParseCounts: state.incrementParseCounts,
      }))
    );

  const frameStreamRef = useRef(new TextFrameStream());
  const parseDispatcherRef = useRef(new TelemetryParseDispatcher());

  const batchLinesRef = useRef<Omit<BleLine, "id">[]>([]);
  const batchStatsRef = useRef({ bytes_received: 0, bytes_sent: 0 });
  const telemetryIngestionRef = useRef(new TelemetryIngestionBuffer());
  const updateTimerRef = useRef<number | null>(null);
  const idleFlushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const flushBatch = () => {
      if (batchLinesRef.current.length > 0) {
        addLines(batchLinesRef.current);
        batchLinesRef.current = [];
      }
      const telemetryBatch = telemetryIngestionRef.current.drain();
      if (telemetryBatch.points.length > 0) addChartDataBatch(telemetryBatch.points);
      if (telemetryBatch.success > 0 || telemetryBatch.fail > 0)
        incrementParseCounts(telemetryBatch.success, telemetryBatch.fail);
      if (batchStatsRef.current.bytes_received > 0 || batchStatsRef.current.bytes_sent > 0) {
        const cur = useBluetoothStore.getState().stats;
        updateStats({
          bytes_received: cur.bytes_received + batchStatsRef.current.bytes_received,
          bytes_sent: cur.bytes_sent + batchStatsRef.current.bytes_sent,
        });
        batchStatsRef.current = { bytes_received: 0, bytes_sent: 0 };
      }
      updateTimerRef.current = null;
    };

    const scheduleBatchUpdate = () => {
      if (updateTimerRef.current === null) {
        updateTimerRef.current = requestAnimationFrame(flushBatch);
      }
    };

    const queueLines = (lines: Omit<BleLine, "id">[]) => {
      if (lines.length === 0) return;
      batchLinesRef.current.push(...lines);
      const chartConfig = useBluetoothStore.getState().chartConfig;
      // 字节流模式下文本行只用于日志显示，遥测数值由 ingestBytes 产出
      if (chartConfig.enabled && getChartParser(chartConfig.parseMode)?.kind !== "bytes") {
        telemetryIngestionRef.current.ingestLines(lines, chartConfig);
      }
    };

    /** 字节流解析：仅在选用字节流解析器时有产出。 */
    const ingestBytes = (data: number[], timestamp: number) => {
      const chartConfig = useBluetoothStore.getState().chartConfig;
      const parsed = parseDispatcherRef.current.ingestBytes(data, chartConfig, timestamp);
      if (!parsed) return;

      if (parsed.detectedChannels) {
        useBluetoothStore.getState().setChartConfig({ ...chartConfig, channels: parsed.detectedChannels });
      }
      telemetryIngestionRef.current.ingestBatch({
        points: parsed.points,
        success: parsed.success,
        fail: parsed.fail,
      });
    };

    const clearIdleFlush = () => {
      if (idleFlushTimerRef.current !== null) window.clearTimeout(idleFlushTimerRef.current);
      idleFlushTimerRef.current = null;
    };

    const flushPending = (schedule = true) => {
      clearIdleFlush();
      const lines = frameStreamRef.current.flush();
      queueLines(lines);
      if (schedule && lines.length > 0) scheduleBatchUpdate();
    };

    const scheduleIdleFlush = () => {
      clearIdleFlush();
      idleFlushTimerRef.current = window.setTimeout(flushPending, TEXT_FRAME_IDLE_MS);
    };

    const unlistenData = listen<BleDataEvent>("ble-data", (event) => {
      const { chunks, direction } = event.payload;

      for (const { data, timestamp } of chunks) {
        if (direction === "rx") {
          batchStatsRef.current.bytes_received += data.length;
        } else {
          batchStatsRef.current.bytes_sent += data.length;
        }
        // 字节流解析只对接收方向有意义：发出去的内容不是设备上报的遥测
        if (direction === "rx") ingestBytes(data, timestamp);
        queueLines(frameStreamRef.current.ingest(data, timestamp, direction));
      }

      scheduleBatchUpdate();
      if (chunks.length > 0) scheduleIdleFlush();
    });

    const unlistenStatus = listen<BleStatusEvent>("ble-status", (event) => {
      const { connected, running, error } = event.payload;
      if (!running) {
        flushPending(false);
        frameStreamRef.current.reset();
        parseDispatcherRef.current.reset();
        scheduleBatchUpdate();
      }
      setConnected(connected);
      setRunning(running);
      if (error) setError(error);
    });

    return () => {
      flushPending(false);
      frameStreamRef.current.reset();
      parseDispatcherRef.current.reset();
      if (updateTimerRef.current !== null) {
        cancelAnimationFrame(updateTimerRef.current);
      }
      flushBatch();
      unlistenData.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
    };
  }, [addLines, updateStats, setRunning, setConnected, setError, addChartDataBatch, incrementParseCounts]);
}

export function useBluetoothStats() {
  const { lineCount, stats, running, connected } = useBluetoothStore(
    useShallow((state) => ({
      lineCount: state.lines.length,
      stats: state.stats,
      running: state.running,
      connected: state.connected,
    }))
  );
  return {
    lineCount,
    bytesReceived: stats.bytes_received,
    bytesSent: stats.bytes_sent,
    running,
    connected,
    bytesReceivedFormatted: formatBytes(stats.bytes_received),
    bytesSentFormatted: formatBytes(stats.bytes_sent),
  };
}
