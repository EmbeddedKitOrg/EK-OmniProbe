import { writeSerial, writeSerialString } from "@/lib/tauri";
import type { Encoding, LineEnding } from "@/lib/serialTypes";
import { useSerialStore } from "@/stores/serialStore";

interface SerialSendOptions {
  encoding?: Encoding;
  lineEnding?: LineEnding;
  hexMode?: boolean;
}

function lineEndingText(lineEnding: LineEnding) {
  return lineEnding === "cr" ? "\r" : lineEnding === "crlf" ? "\r\n" : lineEnding === "lf" ? "\n" : "";
}

function recordSimulationTx(byteLength: number) {
  const state = useSerialStore.getState();
  state.updateStats({ ...state.stats, bytes_sent: state.stats.bytes_sent + byteLength });
}

export async function writeSerialData(bytes: number[]): Promise<number> {
  const state = useSerialStore.getState();
  if (!state.connected) throw new Error("串口未连接");
  if (state.activeSourceType === "simulation") {
    recordSimulationTx(bytes.length);
    return bytes.length;
  }
  return writeSerial(bytes);
}

export async function writeSerialText(text: string, encoding: Encoding, lineEnding: LineEnding): Promise<number> {
  const state = useSerialStore.getState();
  if (!state.connected) throw new Error("串口未连接");
  if (state.activeSourceType === "simulation") {
    const byteLength = new TextEncoder().encode(`${text}${lineEndingText(lineEnding)}`).length;
    recordSimulationTx(byteLength);
    return byteLength;
  }
  return writeSerialString(text, encoding, lineEnding);
}

export function parseHexBytes(text: string): number[] {
  const compact = text.replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]*$/.test(compact) || compact.length % 2 !== 0) {
    throw new Error("无效的十六进制格式");
  }
  return Array.from({ length: compact.length / 2 }, (_, index) =>
    parseInt(compact.slice(index * 2, index * 2 + 2), 16)
  );
}

function recordTx(text: string, rawData: number[]) {
  const state = useSerialStore.getState();
  if (state.textViewMode !== "terminal") {
    state.addLine({
      timestamp: new Date(),
      text,
      level: "info",
      rawData,
      direction: "tx",
    });
  }
}

export function recordSerialFileTx(name: string, byteLength: number, simulation: boolean) {
  if (simulation) recordSimulationTx(byteLength);
  recordTx(`文件: ${name} (${byteLength} 字节)`, []);
}

export async function sendSerialBytes(bytes: number[], label: string): Promise<void> {
  if (!useSerialStore.getState().connected) throw new Error("串口未连接");
  await writeSerialData(bytes);
  recordTx(label, bytes);
}

export async function sendSerialPayload(text: string, options: SerialSendOptions = {}): Promise<void> {
  const state = useSerialStore.getState();
  if (!state.connected) throw new Error("串口未连接");

  const settings = { ...state.sendSettings, ...options };
  if (settings.hexMode) {
    const bytes = parseHexBytes(text);
    await writeSerialData(bytes);
    recordTx(`HEX: ${text}`, bytes);
    return;
  }

  await writeSerialText(text, settings.encoding, settings.lineEnding);
  recordTx(text, Array.from(new TextEncoder().encode(text)));
  if (state.textViewMode === "terminal" && state.terminalSettings.localEcho) {
    state.appendTerminalChunk(`${text}${lineEndingText(settings.lineEnding)}`);
  }
}
