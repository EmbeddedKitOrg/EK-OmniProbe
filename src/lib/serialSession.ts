// 串口采集会话的录制与回放接线。
//
// 录制器是可变的采集状态，不参与渲染，因此放在模块作用域而不是 store state 里
// （与 telemetryFilter 的处理方式一致）；供 UI 显示的开关和计数放在 store。

import { SerialReceivePipeline, mergeSerialReceiveResults, type SerialReceiveResult } from "./serialReceivePipeline";
import { SessionRecorder, parseSessionFile, type SessionHeader } from "./sessionRecord";
import type { RxFramingSettings } from "./serialTypes";
import type { ChartConfig } from "./chartTypes";
import { DEFAULT_RX_FRAMING } from "./serialTypes";

const recorder = new SessionRecorder();

export function startSessionRecording(): void {
  recorder.start();
}

export function stopSessionRecording(): void {
  recorder.clear();
}

/** 录一块原始字节。非录制状态由调用方判断，这里不做检查以免每块都查 store。 */
export function captureSessionChunk(data: number[], timestamp: number): void {
  recorder.record(data, timestamp);
}

export function getSessionStats(): { chunkCount: number; byteCount: number; truncated: boolean; empty: boolean } {
  return {
    chunkCount: recorder.chunkCount,
    byteCount: recorder.byteCount,
    truncated: recorder.isTruncated,
    empty: recorder.isEmpty,
  };
}

export function serializeSession(chartConfig: ChartConfig, framing: RxFramingSettings, note?: string): string {
  return recorder.serialize({ source: "serial", chartConfig, framing, note });
}

export interface SessionReplayResult {
  header: SessionHeader;
  /** 回放产出的合并结果，可直接交给 store 提交 */
  result: SerialReceiveResult;
  chunkCount: number;
}

/**
 * 回放会话文件。
 *
 * 用一条全新的管线跑，不复用实时采集那条——否则实时残包会混进回放结果。
 * chartConfig 允许由调用方覆盖：这正是这个功能存在的意义，
 * 可以拿同一份原始字节试不同的解析或滤波配置。
 */
export function replaySession(text: string, overrideConfig?: ChartConfig): SessionReplayResult {
  const session = parseSessionFile(text);
  const chartConfig = overrideConfig ?? session.header.chartConfig;
  const framing = session.header.framing ?? DEFAULT_RX_FRAMING;

  const pipeline = new SerialReceivePipeline();
  const results: SerialReceiveResult[] = [];
  let effectiveConfig = chartConfig;

  for (const chunk of session.chunks) {
    const result = pipeline.ingest(
      { direction: "rx", chunks: [{ data: chunk.d, timestamp: chunk.t }] },
      { framing, chartConfig: effectiveConfig }
    );
    // 二进制解析器首帧才能确定通道数，之后的块要沿用推断出的通道
    if (result.detectedChannels) {
      effectiveConfig = { ...effectiveConfig, channels: result.detectedChannels };
    }
    results.push(result);
  }

  // 刷出末尾残帧，否则最后一行没有换行符时会丢
  results.push(pipeline.flushPending({ framing, chartConfig: effectiveConfig }));

  return {
    header: session.header,
    result: mergeSerialReceiveResults(results),
    chunkCount: session.chunks.length,
  };
}
