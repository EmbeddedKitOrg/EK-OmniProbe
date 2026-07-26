// 采集会话的录制与回放接线，三条数据来源共用。
//
// 录制器是可变的采集状态，不参与渲染，因此放在模块作用域而不是 store state 里
// （与 telemetryFilter 的处理方式一致）；供 UI 显示的开关放在各自的 store。
//
// 每条来源各持一个录制器：三者可能同时在采集，共用一个会把字节混在一起。

import { SerialReceivePipeline, mergeSerialReceiveResults, type SerialReceiveResult } from "./serialReceivePipeline";
import { SessionRecorder, parseSessionFile, type SessionHeader, type SessionSource } from "./sessionRecord";
import type { RxFramingSettings } from "./serialTypes";
import type { ChartConfig } from "./chartTypes";
import { DEFAULT_RX_FRAMING } from "./serialTypes";

const recorders: Record<SessionSource, SessionRecorder> = {
  serial: new SessionRecorder(),
  rtt: new SessionRecorder(),
  bluetooth: new SessionRecorder(),
};

export function startSessionRecording(source: SessionSource): void {
  recorders[source].start();
}

export function stopSessionRecording(source: SessionSource): void {
  recorders[source].clear();
}

/**
 * 录一块原始字节。是否处于录制状态由调用方判断，这里不查 store——
 * 这是每个数据块都会走的路径，不该为此增加一次状态读取。
 *
 * channel 仅 RTT 使用：不同通道的字节必须能在回放时区分开。
 */
export function captureSessionChunk(source: SessionSource, data: number[], timestamp: number, channel?: number): void {
  recorders[source].record(data, timestamp, channel);
}

export interface SessionStats {
  chunkCount: number;
  byteCount: number;
  truncated: boolean;
  empty: boolean;
}

export function getSessionStats(source: SessionSource): SessionStats {
  const recorder = recorders[source];
  return {
    chunkCount: recorder.chunkCount,
    byteCount: recorder.byteCount,
    truncated: recorder.isTruncated,
    empty: recorder.isEmpty,
  };
}

export function serializeSession(
  source: SessionSource,
  chartConfig: ChartConfig,
  framing?: RxFramingSettings,
  note?: string
): string {
  return recorders[source].serialize({ source, chartConfig, framing, note });
}

export interface SessionReplayResult {
  header: SessionHeader;
  /** 回放产出的合并结果，可直接交给 store 提交 */
  result: SerialReceiveResult;
  chunkCount: number;
  /** 会话里出现过的 RTT 通道号（升序）；其他来源为空数组 */
  channels: number[];
}

/**
 * 回放会话文件。
 *
 * 用全新的管线跑，不复用实时采集那条——否则实时残包会混进回放结果。
 * chartConfig 允许由调用方覆盖：这正是这个功能存在的意义，
 * 可以拿同一份原始字节试不同的解析或滤波配置。
 *
 * RTT 会话按通道分别过管线：不同通道的残包不能相互拼接，
 * 否则跨通道的半帧会被错误地接成一帧。
 */
export function replaySession(text: string, overrideConfig?: ChartConfig): SessionReplayResult {
  const session = parseSessionFile(text);
  const chartConfig = overrideConfig ?? session.header.chartConfig;
  const framing = session.header.framing ?? DEFAULT_RX_FRAMING;

  // 按通道分组；无通道号的归到 -1 这一组（串口与 BLE 只有这一组）
  const byChannel = new Map<number, { data: number[]; timestamp: number }[]>();
  for (const chunk of session.chunks) {
    const key = chunk.ch ?? -1;
    const group = byChannel.get(key);
    if (group) group.push({ data: chunk.d, timestamp: chunk.t });
    else byChannel.set(key, [{ data: chunk.d, timestamp: chunk.t }]);
  }

  const results: SerialReceiveResult[] = [];
  let effectiveConfig = chartConfig;

  for (const chunks of byChannel.values()) {
    const pipeline = new SerialReceivePipeline();
    for (const chunk of chunks) {
      const result = pipeline.ingest({ direction: "rx", chunks: [chunk] }, { framing, chartConfig: effectiveConfig });
      // 二进制解析器首帧才能确定通道数，之后的块要沿用推断出的通道
      if (result.detectedChannels) {
        effectiveConfig = { ...effectiveConfig, channels: result.detectedChannels };
      }
      results.push(result);
    }
    // 刷出末尾残帧，否则最后一行没有换行符时会丢
    results.push(pipeline.flushPending({ framing, chartConfig: effectiveConfig }));
  }

  return {
    header: session.header,
    result: mergeSerialReceiveResults(results),
    chunkCount: session.chunks.length,
    channels: [...byChannel.keys()].filter((key) => key >= 0).sort((a, b) => a - b),
  };
}
