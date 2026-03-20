/**
 * RTT 图表查看器组件
 * 从 RttStore 获取数据并传递给通用 ChartViewer
 */

import { useRttStore } from "@/stores/rttStore";
import { ChartViewer } from "./ChartViewer";

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
  } = useRttStore();

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
