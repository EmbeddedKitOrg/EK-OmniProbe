// 触发捕获。
//
// 触发逻辑是典型的「差一个就全错」区域：边沿判定差一个样本、噪声反复误触发、
// 捕获期间重复触发、窗口切错位置，都会让用户抓到的不是他要的那一刻。
// 而这些都无法靠肉眼在实机上确认（现象本来就是瞬时的），所以必须在这里断言死。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { TriggerDetector, matchesTrigger, sliceTriggerWindow, DEFAULT_TRIGGER_CONFIG } =
    await server.ssrLoadModule("/src/lib/triggerCapture.ts");

  const sample = (v) => ({ timestamp: 0, values: { v } });
  const samples = (...vs) => vs.map(sample);
  const cfg = (over) => ({ ...DEFAULT_TRIGGER_CONFIG, enabled: true, channelKey: "v", ...over });

  // ---- 1) matchesTrigger 的四种条件 ----
  {
    // 上升沿：必须是穿越，不是「当前值高于电平」
    assert.equal(matchesTrigger(0, 5, "rising", 3), true, "0->5 越过 3 应触发");
    assert.equal(matchesTrigger(4, 5, "rising", 3), false, "4->5 都在电平之上，未穿越");
    assert.equal(matchesTrigger(5, 0, "rising", 3), false, "下降不应触发上升沿");
    assert.equal(matchesTrigger(3, 4, "rising", 3), true, "恰好从电平值上穿应触发");
    assert.equal(matchesTrigger(2, 3, "rising", 3), false, "升到电平但未越过，不触发");

    assert.equal(matchesTrigger(5, 0, "falling", 3), true, "5->0 越过 3 应触发");
    assert.equal(matchesTrigger(2, 1, "falling", 3), false, "都在电平之下，未穿越");
    assert.equal(matchesTrigger(3, 2, "falling", 3), true, "恰好从电平值下穿应触发");

    // 电平条件逐样本判断，与前值无关
    assert.equal(matchesTrigger(undefined, 5, "above", 3), true);
    assert.equal(matchesTrigger(undefined, 1, "above", 3), false);
    assert.equal(matchesTrigger(undefined, 1, "below", 3), true);

    // 没有前值时边沿不触发——否则一启动就会误触发
    assert.equal(matchesTrigger(undefined, 5, "rising", 3), false, "缺前值时上升沿不应触发");
    assert.equal(matchesTrigger(undefined, 0, "falling", 3), false, "缺前值时下降沿不应触发");

    // 非有限值不参与
    assert.equal(matchesTrigger(0, Number.NaN, "rising", 3), false);
    assert.equal(matchesTrigger(Number.NaN, 5, "rising", 3), false);
    console.log("  四种触发条件的边界判定正确（含恰好等于电平、缺前值、NaN）");
  }

  // ---- 2) 单次模式：触发后停住，不再响应后续穿越 ----
  {
    const d = new TriggerDetector();
    const config = cfg({ mode: "single", condition: "rising", level: 3, postSamples: 3 });

    // 0,1,2 不触发；5 触发（触发点算第 1 个后置样本）；再 2 个后置样本后完成
    assert.equal(d.push(samples(0, 1, 2), config), false, "未穿越时不应完成捕获");
    assert.equal(d.getStatus().state, "armed");

    assert.equal(d.push(samples(5), config), false, "刚触发但后置样本没凑够");
    assert.equal(d.getStatus().state, "capturing");
    assert.equal(d.getStatus().remainingPostSamples, 2);

    assert.equal(d.push(samples(6), config), false);
    assert.equal(d.push(samples(7), config), true, "凑够后置样本应完成捕获");
    assert.equal(d.getStatus().state, "triggered");
    assert.equal(d.getStatus().captureCount, 1);

    // 已触发后再来穿越也不应再捕获
    assert.equal(d.push(samples(0, 9, 0, 9), config), false, "单次模式捕获后不应再触发");
    assert.equal(d.getStatus().captureCount, 1);
    console.log("  单次模式：触发后冻结，后续穿越不再响应");
  }

  // ---- 3) 正常模式：捕获完自动重新武装 ----
  {
    const d = new TriggerDetector();
    const config = cfg({ mode: "normal", condition: "rising", level: 3, postSamples: 1 });

    // postSamples=1 意味着触发点本身就是唯一的后置样本，应立即完成
    assert.equal(d.push(samples(0, 5), config), true, "第一次穿越应立即完成捕获");
    assert.equal(d.getStatus().captureCount, 1);
    assert.equal(d.getStatus().state, "armed", "正常模式应自动重新武装");

    assert.equal(d.push(samples(0, 5), config), true, "第二次穿越应再次捕获");
    assert.equal(d.getStatus().captureCount, 2);
    console.log("  正常模式：捕获完自动重新武装，可反复触发");
  }

  // ---- 4) 捕获期间不重复触发（电平条件最容易踩）----
  {
    const d = new TriggerDetector();
    // above 条件逐样本都成立，若状态机没挡住，会每个样本都触发一次
    const config = cfg({ mode: "normal", condition: "above", level: 3, postSamples: 5 });

    d.push(samples(5, 5, 5, 5), config); // 全部高于电平
    assert.equal(d.getStatus().captureCount, 0, "后置样本没凑够时不应完成");
    assert.equal(d.getStatus().state, "capturing", "捕获期间应保持 capturing，不重复触发");

    d.push(samples(5), config);
    assert.equal(d.getStatus().captureCount, 1, "凑够后置样本才完成一次");
    console.log("  持续成立的电平条件在捕获期间不会重复触发");
  }

  // ---- 5) 一批数据里跨越触发点：批内下标不能算错 ----
  {
    const d = new TriggerDetector();
    const config = cfg({ mode: "single", condition: "rising", level: 3, postSamples: 3 });
    // 一批里同时包含触发前、触发点和足够的后置样本
    const completed = d.push(samples(0, 1, 5, 6, 7), config);
    assert.equal(completed, true, "同一批内应能完成整个捕获");
    assert.equal(d.getStatus().captureCount, 1);
    assert.equal(d.getStatus().state, "triggered");
  }

  // ---- 6) 关闭触发应复位；未配置通道时不工作但保留状态 ----
  {
    const d = new TriggerDetector();
    d.push(samples(0, 5, 6, 7), cfg({ condition: "rising", level: 3, postSamples: 2 }));
    assert.ok(d.getStatus().captureCount > 0);

    d.push(samples(0), { ...DEFAULT_TRIGGER_CONFIG, enabled: false });
    assert.equal(d.getStatus().state, "idle", "关闭触发应复位");
    assert.equal(d.getStatus().captureCount, 0, "复位应清零计数");

    const d2 = new TriggerDetector();
    d2.arm();
    d2.push(samples(0, 5), cfg({ channelKey: "" }));
    assert.equal(d2.getStatus().state, "armed", "未配置通道时应保持原状态");
  }

  // ---- 7) 触发通道不存在于样本中时不应误触发 ----
  {
    const d = new TriggerDetector();
    const config = cfg({ channelKey: "missing", condition: "above", level: -1 });
    // level=-1 且 above，若把 undefined 当成 0 会误触发
    d.push(samples(0, 1, 2), config);
    assert.equal(d.getStatus().captureCount, 0, "通道不存在时不应触发");
  }

  // ---- 8) sliceTriggerWindow 取的是缓冲区末尾 ----
  {
    const buffer = Array.from({ length: 1000 }, (_, i) => sample(i));
    const window = sliceTriggerWindow(buffer, cfg({ preSamples: 100, postSamples: 50 }));
    assert.equal(window.length, 150, "窗口长度应为 pre + post");
    assert.equal(window[0].values.v, 850, "窗口应取自缓冲区末尾");
    assert.equal(window[window.length - 1].values.v, 999, "窗口末尾应是最新样本");

    // 缓冲区不够长时取全部，不足不是错误
    const short = Array.from({ length: 30 }, (_, i) => sample(i));
    const shortWindow = sliceTriggerWindow(short, cfg({ preSamples: 100, postSamples: 50 }));
    assert.equal(shortWindow.length, 30, "缓冲区不足时应返回全部");
    assert.deepEqual(sliceTriggerWindow([], cfg({})), [], "空缓冲区应返回空");
    console.log("  触发窗口从缓冲区末尾切取，长度与不足情形均正确");
  }

  // ---- 9) 噪声不应在电平附近反复误触发 ----
  {
    const d = new TriggerDetector();
    const config = cfg({ mode: "normal", condition: "rising", level: 0, postSamples: 1 });
    // 在电平之上小幅抖动：只有第一次从下方穿越才算，之后都在上方不再穿越
    d.push(samples(-1, 1, 1.1, 0.9, 1.2, 1.05), config);
    assert.equal(d.getStatus().captureCount, 1, `电平之上的抖动不应反复触发，实际 ${d.getStatus().captureCount} 次`);
    console.log("  电平之上的小幅抖动不会反复触发（边沿判定天然只在穿越时成立）");
  }

  console.log("触发捕获检查通过");
} finally {
  await server.close();
}
