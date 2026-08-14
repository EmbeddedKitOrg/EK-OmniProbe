import { PRESET_COLORS, type Channel } from "./chartTypes.ts";

export interface DbcImportResult {
  channels: Channel[];
  messageCount: number;
  skippedMultiplexedSignals: number;
}

interface DbcMessage {
  id: number;
  extended: boolean;
  name: string;
  length: number;
}

const MESSAGE_PATTERN = /^BO_\s+(\d+)\s+([A-Za-z_][\w]*):\s+(\d+)\s+/;
const SIGNAL_PATTERN =
  /^\s*SG_\s+([A-Za-z_][\w]*)(?:\s+([mM]\d*|M))?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s+\(([-+\d.eE]+),([-+\d.eE]+)\)\s+\[[^\]]*\]\s+"([^"]*)"/;

export function parseDbc(content: string): DbcImportResult {
  const channels: Channel[] = [];
  const usedKeys = new Set<string>();
  const messages = new Set<string>();
  let current: DbcMessage | null = null;
  let skippedMultiplexedSignals = 0;

  for (const line of content.split(/\r?\n/)) {
    const messageMatch = line.match(MESSAGE_PATTERN);
    if (messageMatch) {
      const rawId = Number(messageMatch[1]);
      const extended = rawId >= 0x80000000;
      const id = extended ? rawId - 0x80000000 : rawId;
      current =
        Number.isInteger(id) && id >= 0 && id <= (extended ? 0x1fffffff : 0x7ff)
          ? { id, extended, name: messageMatch[2], length: Number(messageMatch[3]) }
          : null;
      if (current) messages.add(`${extended}:${id}`);
      continue;
    }

    if (!current) continue;
    const signalMatch = line.match(SIGNAL_PATTERN);
    if (!signalMatch) continue;
    // ponytail: 多路复用信号先跳过；需要时按 multiplexor 值扩展 CanSignalSource。
    if (signalMatch[2]) {
      skippedMultiplexedSignals += 1;
      continue;
    }

    const signalName = signalMatch[1];
    let key = `${current.name}_${signalName}`;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${current.name}_${signalName}_${suffix++}`;
    usedKeys.add(key);
    channels.push({
      key,
      name: `${current.name}.${signalName}`,
      unit: signalMatch[9] || undefined,
      color: PRESET_COLORS[channels.length % PRESET_COLORS.length],
      visible: true,
      role: "y",
      can: {
        frameId: current.id,
        extended: current.extended,
        fd: current.length > 8 ? true : undefined,
        startBit: Number(signalMatch[3]),
        bitLength: Number(signalMatch[4]),
        byteOrder: signalMatch[5] === "1" ? "little" : "big",
        signed: signalMatch[6] === "-",
        factor: Number(signalMatch[7]),
        offset: Number(signalMatch[8]),
      },
    });
  }

  if (channels.length === 0) throw new Error("DBC 中没有可导入的普通信号");
  return { channels, messageCount: messages.size, skippedMultiplexedSignals };
}
