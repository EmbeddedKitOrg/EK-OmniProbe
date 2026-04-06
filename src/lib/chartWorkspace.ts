import type { ChartConfig, ChartDataPoint } from "@/lib/chartTypes";

export type ChartWorkspaceSource = "rtt" | "serial";

export interface ChartWorkspaceSnapshot {
  source: ChartWorkspaceSource;
  title: string;
  subtitle: string;
  chartData: ChartDataPoint[];
  chartConfig: ChartConfig;
  chartPaused: boolean;
  parseSuccessCount: number;
  parseFailCount: number;
}

export type ChartWorkspaceAction =
  | {
      source: ChartWorkspaceSource;
      type: "set-paused";
      paused: boolean;
    }
  | {
      source: ChartWorkspaceSource;
      type: "clear-data";
    }
  | {
      source: ChartWorkspaceSource;
      type: "set-config";
      config: ChartConfig;
    }
  | {
      source: ChartWorkspaceSource;
      type: "restore-inline";
    };

export interface ChartWorkspaceReadyPayload {
  source: ChartWorkspaceSource;
}

export const CHART_WORKSPACE_SNAPSHOT_EVENT = "chart-workspace:snapshot";
export const CHART_WORKSPACE_ACTION_EVENT = "chart-workspace:action";
export const CHART_WORKSPACE_READY_EVENT = "chart-workspace:ready";

export function getChartWorkspaceWindowLabel(source: ChartWorkspaceSource) {
  return `chart-workspace-${source}`;
}

export function getChartWorkspaceWindowTitle(source: ChartWorkspaceSource) {
  return source === "rtt" ? "RTT 图表工作台" : "串口图表工作台";
}
