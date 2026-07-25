import type { ChartConfig, ChartDataPoint } from "@/lib/chartTypes";

export const CHART_WORKSPACE_SOURCES = ["rtt", "serial", "bluetooth"] as const;

export type ChartWorkspaceSource = (typeof CHART_WORKSPACE_SOURCES)[number];

export function isChartWorkspaceSource(value: string | null): value is ChartWorkspaceSource {
  return CHART_WORKSPACE_SOURCES.some((source) => source === value);
}

export interface ChartWorkspaceSnapshot {
  source: ChartWorkspaceSource;
  title: string;
  subtitle: string;
  chartData: ChartDataPoint[];
  processedChartData?: ChartDataPoint[];
  filterActive: boolean;
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
  if (source === "rtt") return "RTT 图表工作台";
  if (source === "serial") return "串口图表工作台";
  return "蓝牙图表工作台";
}
