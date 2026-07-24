import type { ChartConfig, ChartDataPoint } from "@/lib/chartTypes";
import type { Encoding, LineEnding } from "@/lib/serialTypes";

export interface SerialControlPanelSnapshot {
  connected: boolean;
  chartData: ChartDataPoint[];
  chartConfig: ChartConfig;
  sendSettings: {
    encoding: Encoding;
    lineEnding: LineEnding;
    hexMode: boolean;
  };
}

export type SerialControlPanelWindowAction =
  | { type: "send"; id: string; text: string; hexMode: boolean }
  | { type: "restore-inline" };

export interface SerialControlPanelSendResult {
  id: string;
  error?: string;
}

export const SERIAL_CONTROL_PANEL_WINDOW_LABEL = "serial-control-panel";
export const SERIAL_CONTROL_PANEL_SNAPSHOT_EVENT = "serial-control-panel:snapshot";
export const SERIAL_CONTROL_PANEL_ACTION_EVENT = "serial-control-panel:action";
export const SERIAL_CONTROL_PANEL_READY_EVENT = "serial-control-panel:ready";
export const SERIAL_CONTROL_PANEL_SEND_RESULT_EVENT = "serial-control-panel:send-result";
