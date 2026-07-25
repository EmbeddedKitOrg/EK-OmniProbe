export const WORKSPACES = [
  { id: "flash", shortLabel: "烧录", label: "烧录工作台", settingsLabel: "烧录工作台" },
  { id: "rtt", shortLabel: "RTT", label: "RTT 调试工作台", settingsLabel: "RTT 工作台" },
  { id: "serial", shortLabel: "串口", label: "串口工作台", settingsLabel: "串口工作台" },
  { id: "log-analysis", shortLabel: "日志", label: "日志分析工作台", settingsLabel: "日志分析工作台" },
  { id: "bluetooth", shortLabel: "蓝牙", label: "蓝牙工作台", settingsLabel: "蓝牙工作台" },
  { id: "control-panel", shortLabel: "面板", label: "控制面板", settingsLabel: "控制面板" },
  { id: "debug", shortLabel: "调试", label: "调试工作台", settingsLabel: "调试工作台" },
] as const;

export type AppMode = (typeof WORKSPACES)[number]["id"];

const APP_MODE_IDS = new Set<string>(WORKSPACES.map(({ id }) => id));

export function isAppMode(value: unknown): value is AppMode {
  return typeof value === "string" && APP_MODE_IDS.has(value);
}
