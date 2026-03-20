import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function formatHex(value: number, length = 8): string {
  return "0x" + value.toString(16).toUpperCase().padStart(length, "0");
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** 从文本内容推断日志级别 */
export function parseLogLevel(
  text: string
): "error" | "warn" | "info" | "debug" {
  const lowerText = text.toLowerCase();
  if (lowerText.includes("[error]") || lowerText.includes("[err]") || lowerText.includes("error:")) {
    return "error";
  }
  if (lowerText.includes("[warn]") || lowerText.includes("[warning]") || lowerText.includes("warning:")) {
    return "warn";
  }
  if (lowerText.includes("[debug]") || lowerText.includes("[dbg]")) {
    return "debug";
  }
  return "info";
}
