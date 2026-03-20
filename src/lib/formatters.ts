// src/lib/formatters.ts
// 通用格式化函数

/** 格式化字节数为可读字符串 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/** 格式化时间戳，输出带毫秒的时间字符串 HH:MM:SS.mmm */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  const s = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

/** 格式化数字为十六进制字符串，带 0x 前缀 */
export function formatHex(value: number, width = 2): string {
  return "0x" + value.toString(16).toUpperCase().padStart(width, "0");
}
