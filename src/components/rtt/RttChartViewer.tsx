/**
 * RTT 图表查看器组件
 * 从 RttStore 获取数据并传递给通用 ChartViewer
 */

import { useRttStore } from "@/stores/rttStore";
import { ChartViewer } from "./ChartViewer";
import { useShallow } from "zustand/react/shallow";

export function RttChartViewer() {
  const {
    chartData,
    chartConfig,
    chartPaused,
    parseSuccessCount,
    parseFailCount,
    setChartPaused,
    clearChartData,
    setChartConfig,
  } = useRttStore(
    useShallow((state) => ({
      chartData: state.chartData,
      chartConfig: state.chartConfig,
      chartPaused: state.chartPaused,
      parseSuccessCount: state.parseSuccessCount,
      parseFailCount: state.parseFailCount,
      setChartPaused: state.setChartPaused,
      clearChartData: state.clearChartData,
      setChartConfig: state.setChartConfig,
    }))
  );

  return (
    <ChartViewer
      chartData={chartData}
      chartConfig={chartConfig}
      chartPaused={chartPaused}
      parseSuccessCount={parseSuccessCount}
      parseFailCount={parseFailCount}
      setChartPaused={setChartPaused}
      clearChartData={clearChartData}
      setChartConfig={setChartConfig}
    />
  );
}
