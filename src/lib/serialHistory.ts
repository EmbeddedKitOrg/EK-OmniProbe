// src/lib/serialHistory.ts
// 串口发送历史的共享存储 (SendBar 与 Terminal 行编辑模式都读/写它)

const SEND_HISTORY_KEY = "serial_send_history";
export const MAX_SEND_HISTORY = 20;

export function loadSendHistory(): string[] {
  try {
    const saved = localStorage.getItem(SEND_HISTORY_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

export function saveSendHistory(history: string[]): void {
  try {
    localStorage.setItem(SEND_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_SEND_HISTORY)));
  } catch {
    // silent fail
  }
}

/** 把一条新发送插入历史首位，去重，返回截断后的新历史。 */
export function pushSendHistory(history: string[], text: string): string[] {
  if (!text) return history;
  const next = [text, ...history.filter((h) => h !== text)].slice(0, MAX_SEND_HISTORY);
  saveSendHistory(next);
  return next;
}
