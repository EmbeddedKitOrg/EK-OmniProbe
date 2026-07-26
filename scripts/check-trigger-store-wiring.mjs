// 触发捕获接入 store 后的端到端验证。
//
// 核心状态机已单独测过，这里验的是「接线对不对」：配置能否读到、
// 捕获完成后图表是否真的冻结、两种视图模式取到的数据是否符合预期、
// 重新武装与清空是否把状态收拾干净。
//
// 三条来源各自持有独立的检测器实例，因此逐个验证，避免只有串口接对了。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { DEFAULT_CHART_CONFIG, DEFAULT_TRIGGER_CONFIG, migrateChartConfig } =
    await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { useSerialStore } = await server.ssrLoadModule("/src/stores/serialStore.ts");
  const { useRttStore } = await server.ssrLoadModule("/src/stores/rttStore.ts");
  const { useBluetoothStore } = await server.ssrLoadModule("/src/stores/bluetoothStore.ts");

  const STORES = [
    ["serial", useSerialStore],
    ["rtt", useRttStore],
    ["bluetooth", useBluetoothStore],
  ];

  const point = (v, t) => ({ timestamp: t, values: { v } });

  /** 造一个带触发配置的图表配置 */
  const chartConfigWith = (trigger) => ({
    ...DEFAULT_CHART_CONFIG,
    enabled: true,
    channels: [{ key: "v", name: "V", color: "#111", visible: true, role: "y" }],
    trigger: { ...DEFAULT_TRIGGER_CONFIG, enabled: true, channelKey: "v", ...trigger },
  });

  const resetStore = (store, chartConfig) => {
    store.setState({
      chartData: [],
      processedChartData: [],
      filterActive: false,
      chartPaused: false,
      triggeredAt: null,
      parseSuccessCount: 0,
      parseFailCount: 0,
      chartConfig,
    });
    store.getState().clearChartData();
    store.setState({ chartConfig });
  };

  // ---- 1) 三条来源都有触发相关状态与动作 ----
  {
    for (const [name, store] of STORES) {
      const state = store.getState();
      assert.equal(state.triggeredAt, null, `${name} 初始 triggeredAt 应为 null`);
      assert.equal(typeof state.rearmTrigger, "function", `${name} 应有 rearmTrigger`);
      assert.ok(state.chartConfig.trigger, `${name} 的 chartConfig 应含 trigger 配置`);
    }
    console.log("  三条来源均已接入触发状态与重新武装动作");
  }

  // ---- 2) 未启用触发时不应冻结图表 ----
  {
    for (const [name, store] of STORES) {
      const config = { ...chartConfigWith({}), trigger: { ...DEFAULT_TRIGGER_CONFIG, enabled: false } };
      resetStore(store, config);
      store.getState().addChartDataBatch([point(0, 0), point(100, 1), point(0, 2)]);
      assert.equal(store.getState().chartPaused, false, `${name}：未启用触发时不应冻结`);
      assert.equal(store.getState().triggeredAt, null);
    }
    console.log("  未启用触发时数据照常滚动，不冻结");
  }

  // ---- 3) 窗口模式：触发后冻结，图表只保留触发窗口 ----
  {
    for (const [name, store] of STORES) {
      const config = chartConfigWith({
        condition: "rising",
        level: 50,
        preSamples: 5,
        postSamples: 3,
        mode: "single",
        view: "window",
      });
      resetStore(store, config);

      // 先灌一批低于电平的样本作为预触发数据
      const pre = Array.from({ length: 20 }, (_, i) => point(0, i));
      store.getState().addChartDataBatch(pre);
      assert.equal(store.getState().chartPaused, false, `${name}：未穿越时不应冻结`);

      // 穿越 + 足够的后置样本
      store.getState().addChartDataBatch([point(100, 20), point(100, 21), point(100, 22)]);

      const after = store.getState();
      assert.equal(after.chartPaused, true, `${name}：触发后应冻结图表`);
      assert.equal(after.triggeredAt, 20, `${name}：触发点时间戳应为穿越那一刻`);
      assert.equal(after.chartData.length, 8, `${name}：窗口应为 pre + post = 8 个点，实际 ${after.chartData.length}`);
      assert.equal(after.chartData[after.chartData.length - 1].timestamp, 22, `${name}：窗口末尾应是最后一个后置样本`);
    }
    console.log("  窗口模式：触发后冻结，图表只保留 pre + post 个点");
  }

  // ---- 4) 全量模式：触发后冻结，但保留整个缓冲区 ----
  {
    for (const [name, store] of STORES) {
      const config = chartConfigWith({
        condition: "rising",
        level: 50,
        preSamples: 5,
        postSamples: 3,
        mode: "single",
        view: "full",
      });
      resetStore(store, config);

      const pre = Array.from({ length: 20 }, (_, i) => point(0, i));
      store.getState().addChartDataBatch(pre);
      store.getState().addChartDataBatch([point(100, 20), point(100, 21), point(100, 22)]);

      const after = store.getState();
      assert.equal(after.chartPaused, true, `${name}：全量模式同样应冻结`);
      assert.equal(after.chartData.length, 23, `${name}：全量模式应保留整个缓冲区，实际 ${after.chartData.length}`);
      assert.equal(after.triggeredAt, 20, `${name}：全量模式也要给出触发点供标记`);
    }
    console.log("  全量模式：触发后冻结但保留完整缓冲区，仅记录触发点");
  }

  // ---- 5) 重新武装应解冻并清除触发点 ----
  {
    for (const [name, store] of STORES) {
      const config = chartConfigWith({ condition: "above", level: 50, postSamples: 1, mode: "single" });
      resetStore(store, config);
      store.getState().addChartDataBatch([point(100, 0)]);
      assert.equal(store.getState().chartPaused, true, `${name}：应已触发`);

      store.getState().rearmTrigger();
      assert.equal(store.getState().chartPaused, false, `${name}：重新武装应解冻`);
      assert.equal(store.getState().triggeredAt, null, `${name}：重新武装应清除触发点`);

      // 重新武装后应能再次触发
      store.getState().addChartDataBatch([point(100, 10)]);
      assert.equal(store.getState().chartPaused, true, `${name}：重新武装后应能再次触发`);
    }
    console.log("  重新武装：解冻、清除触发点，且能再次触发");
  }

  // ---- 6) 清空图表应把触发状态一并收拾干净 ----
  {
    for (const [name, store] of STORES) {
      const config = chartConfigWith({ condition: "above", level: 50, postSamples: 1, mode: "single" });
      resetStore(store, config);
      store.getState().addChartDataBatch([point(100, 0)]);
      assert.equal(store.getState().triggeredAt, 0);

      store.getState().clearChartData();
      assert.equal(store.getState().triggeredAt, null, `${name}：清空应清除触发点`);
      assert.deepEqual(store.getState().chartData, [], `${name}：清空应清空数据`);

      // 清空后检测器也应复位——否则残留的"已触发"状态会让后续数据永远不再触发
      store.setState({ chartPaused: false });
      store.getState().addChartDataBatch([point(100, 10)]);
      assert.equal(store.getState().chartPaused, true, `${name}：清空后应能重新触发（检测器已复位）`);
    }
    console.log("  清空图表：触发点与检测器状态一并复位");
  }

  // ---- 7) 触发配置要能从持久化结构里恢复并被收敛 ----
  {
    const restored = migrateChartConfig({
      ...DEFAULT_CHART_CONFIG,
      trigger: { enabled: true, channelKey: "x", condition: "falling", level: 3.5, preSamples: 10, postSamples: 20 },
    });
    assert.equal(restored.trigger.enabled, true);
    assert.equal(restored.trigger.condition, "falling");
    assert.equal(restored.trigger.level, 3.5);
    assert.equal(restored.trigger.mode, DEFAULT_TRIGGER_CONFIG.mode, "缺失字段应回落到默认值");

    // 非法值应被收敛而不是让状态机跑飞
    const sanitized = migrateChartConfig({
      ...DEFAULT_CHART_CONFIG,
      trigger: { enabled: true, condition: "不存在", mode: "??", view: "??", preSamples: 0, postSamples: -5 },
    });
    assert.equal(sanitized.trigger.condition, DEFAULT_TRIGGER_CONFIG.condition, "非法条件应回落默认");
    assert.equal(sanitized.trigger.mode, DEFAULT_TRIGGER_CONFIG.mode, "非法模式应回落默认");
    assert.equal(sanitized.trigger.view, DEFAULT_TRIGGER_CONFIG.view, "非法视图应回落默认");
    assert.ok(sanitized.trigger.preSamples >= 1, "前置样本数至少为 1，否则窗口为空");
    assert.ok(sanitized.trigger.postSamples >= 1, "后置样本数至少为 1");
    console.log("  触发配置可从持久化恢复，非法值被收敛到合法范围");
  }

  console.log("触发捕获 store 接线检查通过");
} finally {
  await server.close();
}
