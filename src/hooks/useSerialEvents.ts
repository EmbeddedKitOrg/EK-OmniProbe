import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSerialStore } from "@/stores/serialStore";
import type { SerialDataEvent, SerialStatusEvent, SerialLine } from "@/lib/serialTypes";
import type { Channel, ChartConfig, ChartDataPoint } from "@/lib/chartTypes";
import { PRESET_COLORS } from "@/lib/chartTypes";
import { parseChartLines } from "@/lib/parseChartData";
import { parseJustFloatChunk } from "@/lib/parseJustFloat";
import { parseSerialData } from "@/lib/dataFraming";
import { parseLogLevel } from "@/lib/utils";
import { formatBytes } from "@/lib/formatters";
import { publishAiSamples } from "@/lib/tauri";
import { useShallow } from "zustand/react/shallow";

// 非超时模式下的"兜底"空闲刷新：即便选了按换行/自定义分隔符，
// 残留数据静默这么久也强制刷出一行，杜绝无分隔符数据被永久卡住不显示。
const SAFETY_IDLE_MS = 200;

function createJustFloatChannels(count: number): Channel[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `ch${index + 1}`,
    sourceIndex: index,
    name: `通道 ${index + 1}`,
    color: PRESET_COLORS[index % PRESET_COLORS.length],
    visible: true,
    role: "y",
  }));
}

function toJustFloatPoint(values: number[], config: ChartConfig, timestamp: number): ChartDataPoint {
  const mappedValues: Record<string, number> = {};
  config.channels.forEach((channel, index) => {
    const sourceIndex = channel.sourceIndex ?? index;
    if (sourceIndex >= 0 && sourceIndex < values.length) {
      mappedValues[channel.key] = values[sourceIndex];
    }
  });
  return { timestamp, values: mappedValues };
}

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
  } = useSerialStore(
    useShallow((state) => ({
      addLines: state.addLines,
      updateStats: state.updateStats,
      setRunning: state.setRunning,
      setConnected: state.setConnected,
      setError: state.setError,
      appendTerminalChunk: state.appendTerminalChunk,
      addChartDataBatch: state.addChartDataBatch,
      incrementParseCounts: state.incrementParseCounts,
    }))
  );

  const pendingBufferRef = useRef<{ text: string; rawData: number[] }>({
    text: "",
    rawData: [],
  });
  const terminalDecoderRef = useRef(new TextDecoder());
  const justFloatPendingRef = useRef<number[]>([]);

  // 批量处理缓冲区：所有高频更新统一到 requestAnimationFrame 节流
  const batchLinesRef = useRef<Omit<SerialLine, "id">[]>([]);
  const batchStatsRef = useRef({ bytes_received: 0, bytes_sent: 0 });
  const batchTerminalTextRef = useRef<string>("");
  const batchChartPointsRef = useRef<ChartDataPoint[]>([]);
  const batchParseRef = useRef({ success: 0, fail: 0 });
  const updateTimerRef = useRef<number | null>(null);
  const idleFlushTimerRef = useRef<number | null>(null);
  const bridgeErrorReportedRef = useRef(false);

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
        const points = batchChartPointsRef.current;
        addChartDataBatch(points);
        const { aiBridgeStatus, chartConfig } = useSerialStore.getState();
        if (aiBridgeStatus.running) {
          const channels =
            chartConfig.channels.length > 0
              ? chartConfig.channels.map(({ key, name, unit }) => ({ key, name, unit: unit ?? null }))
              : Object.keys(points[0]?.values ?? {}).map((key) => ({ key, name: key, unit: null }));
          for (let index = 0; index < points.length; index += 2048) {
            void publishAiSamples({
              source: "serial",
              sampleRateHz: chartConfig.sampleRateHz,
              channels,
              samples: points.slice(index, index + 2048),
            })
              .then(() => {
                bridgeErrorReportedRef.current = false;
              })
              .catch((error) => {
                if (!bridgeErrorReportedRef.current) {
                  console.warn("AI 数据桥接发布失败", error);
                  bridgeErrorReportedRef.current = true;
                }
              });
          }
        }
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

    // 把 pending 里残留（无换行结尾）的数据刷成一行 RX
    const flushPendingLine = () => {
      idleFlushTimerRef.current = null;
      const pending = pendingBufferRef.current;
      if (pending.rawData.length === 0 && pending.text.length === 0) {
        return;
      }

      batchLinesRef.current.push({
        timestamp: new Date(),
        text: pending.text,
        level: parseLogLevel(pending.text),
        rawData: pending.rawData,
        direction: "rx",
      });
      pendingBufferRef.current = { text: "", rawData: [] };
      scheduleBatchUpdate();
    };

    // 收到数据就重置空闲计时器：静默一段时间后认为一帧结束，刷出残留。
    // timeout 模式用用户配置的 idleMs 作为主断帧；其它模式用更长的兜底值。
    const scheduleIdleFlush = () => {
      if (idleFlushTimerRef.current !== null) {
        clearTimeout(idleFlushTimerRef.current);
      }
      const framing = useSerialStore.getState().rxFraming;
      const delay = framing.mode === "timeout" ? Math.max(5, framing.idleMs) : SAFETY_IDLE_MS;
      idleFlushTimerRef.current = window.setTimeout(flushPendingLine, delay);
    };

    // Listen for serial data events
    const unlistenData = listen<SerialDataEvent>("serial-data", (event) => {
      const { chunks, direction } = event.payload;

      for (const { data, timestamp } of chunks) {
        const terminalText = terminalDecoderRef.current.decode(new Uint8Array(data), { stream: true });
        if (terminalText) {
          batchTerminalTextRef.current += terminalText;
        }

        batchStatsRef.current.bytes_received += data.length;

        let currentChartConfig = useSerialStore.getState().chartConfig;
        if (currentChartConfig.enabled && currentChartConfig.parseMode === "justfloat" && direction === "rx") {
          const result = parseJustFloatChunk(data, justFloatPendingRef.current);
          justFloatPendingRef.current = result.pending;
          batchParseRef.current.fail += result.invalidFrames;

          const channelCount = result.frames[0]?.length ?? 0;
          if (channelCount > 0 && currentChartConfig.channels.length === 0) {
            currentChartConfig = {
              ...currentChartConfig,
              channels: createJustFloatChannels(channelCount),
            };
            useSerialStore.getState().setChartConfig(currentChartConfig);
          }

          for (const frame of result.frames) {
            const point = toJustFloatPoint(frame, currentChartConfig, timestamp);
            if (Object.keys(point.values).length > 0) {
              batchChartPointsRef.current.push(point);
              batchParseRef.current.success += 1;
            } else {
              batchParseRef.current.fail += 1;
            }
          }
        } else if (!currentChartConfig.enabled || currentChartConfig.parseMode !== "justfloat") {
          justFloatPendingRef.current = [];
        }

        // Parse data to lines（按用户选择的接收分帧模式）
        const framing = useSerialStore.getState().rxFraming;
        const { lines, pending } = parseSerialData(
          data,
          timestamp,
          direction as "rx" | "tx",
          pendingBufferRef.current,
          framing
        );
        pendingBufferRef.current = pending;

        if (lines.length > 0) {
          batchLinesRef.current.push(...lines);

          // 图表解析：累积到批，flushBatch 时单次 setState
          currentChartConfig = useSerialStore.getState().chartConfig;
          if (currentChartConfig.enabled && currentChartConfig.parseMode !== "justfloat") {
            const parsed = parseChartLines(lines, currentChartConfig);
            batchChartPointsRef.current.push(...parsed.points);
            batchParseRef.current.success += parsed.success;
            batchParseRef.current.fail += parsed.fail;
          }
        }
      }

      if (chunks.length > 0) {
        // 只要收到数据就调度更新，避免无换行数据时统计不刷新
        scheduleBatchUpdate();
        // 无换行结尾的帧（请求-应答的十六进制/二进制协议）靠空闲超时刷出
        scheduleIdleFlush();
      }
    });

    // Listen for serial status events
    const unlistenStatus = listen<SerialStatusEvent>("serial-status", (event) => {
      const { connected, running, error } = event.payload;
      if (!connected) {
        justFloatPendingRef.current = [];
      }
      setConnected(connected);
      setRunning(running);
      if (error) {
        setError(error);
      }
    });

    // Cleanup
    return () => {
      // 清理定时器
      if (idleFlushTimerRef.current !== null) {
        clearTimeout(idleFlushTimerRef.current);
        idleFlushTimerRef.current = null;
      }
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
  const { lineCount, stats, running, connected } = useSerialStore(
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
