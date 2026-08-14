import { sanitizeBinaryProtocolConfig, type BinaryProtocolConfig } from "./binaryProtocol";
import { loadFromStorage, saveToStorage } from "./storage";

const STORAGE_KEY = "binary-protocol-library-v1";

export function loadBinaryProtocolLibrary(): BinaryProtocolConfig[] {
  const stored = loadFromStorage<{ protocols: unknown[] }>(STORAGE_KEY, { protocols: [] });
  if (!Array.isArray(stored.protocols)) return [];
  const protocols = new Map<string, BinaryProtocolConfig>();
  for (const raw of stored.protocols) {
    const protocol = sanitizeBinaryProtocolConfig(raw);
    protocols.set(protocol.name, protocol);
  }
  return [...protocols.values()];
}

export function saveBinaryProtocolLibrary(protocols: BinaryProtocolConfig[]): void {
  saveToStorage(STORAGE_KEY, { protocols });
}
