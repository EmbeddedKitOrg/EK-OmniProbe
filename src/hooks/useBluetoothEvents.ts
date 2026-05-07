import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBluetoothStore } from "@/stores/bluetoothStore";
import { parseSerialData } from "@/stores/serialStore";
import type { BleDataEvent, BleStatusEvent, BleLine } from "@/lib/bleTypes";
import type { ChartDataPoint } from "@/lib/chartTypes";
import { parseChartData } from "@/lib/parseChartData";
import { formatBytes } from "@/lib/formatters";

/**
 * 监听 BLE 后端事件，复用 serial 的解析与批量更新模式。
 */
export function useBluetoothEvents() {
  const { addLines, updateStats, setRunning, setConnected, setError, addChartDataBatch, incrementParseCounts } =
    useBluetoothStore();

  const pendingBufferRef = useRef<{ text: string; rawData: number[] }>({
    text: "",
    rawData: [],
  });

  const batchLinesRef = useRef<Omit<BleLine, "id">[]>([]);
  const batchStatsRef = useRef({ bytes_received: 0, bytes_sent: 0 });
  const batchChartPointsRef = useRef<ChartDataPoint[]>([]);
  const batchParseRef = useRef({ success: 0, fail: 0 });
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
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
          for (const line of lines) {
            const result = parseChartData(line.text, chartConfig);
            if (result.success && result.dataPoint) {
              batchChartPointsRef.current.push(result.dataPoint);
              batchParseRef.current.success += 1;
            } else {
              batchParseRef.current.fail += 1;
            }
          }
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
  const { lines, stats, running, connected } = useBluetoothStore();
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
