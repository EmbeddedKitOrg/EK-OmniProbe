// Serial port types for frontend

import type { RttLine } from "./types";

/**
 * Serial port information
 */
export interface SerialPortInfo {
  name: string;
  port_type: string;
  description: string | null;
  manufacturer: string | null;
  serial_number: string | null;
}

/**
 * Serial connection configuration - Local serial port
 */
export interface LocalSerialConfig {
  type: "local";
  port: string;
  baud_rate: number;
  data_bits?: 5 | 6 | 7 | 8;
  stop_bits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  flow_control?: "none" | "hardware" | "software";
  reconnect?: boolean;
}

/**
 * Serial connection configuration - TCP serial server
 */
export interface TcpSerialConfig {
  type: "tcp";
  host: string;
  port: number;
  reconnect?: boolean;
}

/**
 * Serial connection configuration (union type)
 */
export type SerialConfig = LocalSerialConfig | TcpSerialConfig;

/**
 * Serial connection statistics
 */
export interface SerialStats {
  bytes_received: number;
  bytes_sent: number;
}

/**
 * Serial status from backend
 */
export interface SerialStatus {
  connected: boolean;
  running: boolean;
  name: string | null;
  stats: SerialStats;
}

/**
 * Serial data event from backend
 */
export interface SerialDataEvent {
  data: number[];
  timestamp: number;
  direction: "rx" | "tx";
}

/**
 * Serial status event from backend
 */
export interface SerialStatusEvent {
  connected: boolean;
  running: boolean;
  error: string | null;
}

/**
 * Serial line (extends RttLine for reuse)
 */
export interface SerialLine extends Omit<RttLine, "channel"> {
  direction: "rx" | "tx";
}

export interface SerialTerminalLine {
  id: number;
  text: string;
}

/**
 * Common baud rates
 */
export const COMMON_BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 76800, 115200,
  128000, 230400, 256000, 460800, 500000, 576000, 921600, 1000000, 1152000,
  1500000, 2000000, 2500000, 3000000, 3500000, 4000000,
] as const;

/**
 * Default serial configuration
 */
export const DEFAULT_SERIAL_CONFIG: LocalSerialConfig = {
  type: "local",
  port: "",
  baud_rate: 115200,
  data_bits: 8,
  stop_bits: 1,
  parity: "none",
  flow_control: "none",
};

/**
 * Data source type for display
 */
export type DataSourceType = "local" | "tcp";

export type SerialTextViewMode = "log" | "terminal";

/**
 * Line ending options
 */
export type LineEnding = "none" | "lf" | "crlf" | "cr";

/**
 * Encoding options
 */
export type Encoding = "utf-8" | "ascii" | "gbk";

export interface SerialTerminalSettings {
  localEcho: boolean;
  interceptShortcuts: boolean;
  /** 行编辑模式：本地累积输入并由 ↑↓ 翻历史，回车后整行发送；关闭则按字符直通发送。 */
  lineMode: boolean;
}
