import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBluetoothStore } from "@/stores/bluetoothStore";
import { parseSerialData } from "@/lib/dataFraming";
import type { BleDataEvent, BleStatusEvent, BleLine } from "@/lib/bleTypes";
import { ChartIngestionBuffer } from "@/lib/chartIngestion";
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

  const pendingBufferRef = useRef<{ text: string; rawData: number[] }>({
    text: "",
    rawData: [],
  });

  const batchLinesRef = useRef<Omit<BleLine, "id">[]>([]);
  const batchStatsRef = useRef({ bytes_received: 0, bytes_sent: 0 });
  const chartIngestionRef = useRef(new ChartIngestionBuffer());
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const flushBatch = () => {
      if (batchLinesRef.current.length > 0) {
        addLines(batchLinesRef.current);
        batchLinesRef.current = [];
      }
      const chartBatch = chartIngestionRef.current.drain();
      if (chartBatch.points.length > 0) addChartDataBatch(chartBatch.points);
      if (chartBatch.success > 0 || chartBatch.fail > 0) incrementParseCounts(chartBatch.success, chartBatch.fail);
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

    const unlistenData = listen<BleDataEvent>("ble-data", (event) => {
      const { data, timestamp, direction } = event.payload;

      if (direction === "rx") {
        batchStatsRef.current.bytes_received += data.length;
      } else {
        batchStatsRef.current.bytes_sent += data.length;
      }

      const { lines, pending } = parseSerialData(data, timestamp, direction as "rx" | "tx", pendingBufferRef.current);
      pendingBufferRef.current = pending;

      if (lines.length > 0) {
        batchLinesRef.current.push(...lines);

        const chartConfig = useBluetoothStore.getState().chartConfig;
        if (chartConfig.enabled) {
          chartIngestionRef.current.ingestLines(lines, chartConfig);
        }
      }

      scheduleBatchUpdate();
    });

    const unlistenStatus = listen<BleStatusEvent>("ble-status", (event) => {
      const { connected, running, error } = event.payload;
      setConnected(connected);
      setRunning(running);
      if (error) setError(error);
    });

    return () => {
      if (updateTimerRef.current !== null) {
        cancelAnimationFrame(updateTimerRef.current);
        flushBatch();
      }
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
