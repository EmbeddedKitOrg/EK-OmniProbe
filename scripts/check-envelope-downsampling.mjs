// 包络抽取存在的唯一理由：不能丢掉尖峰。
//
// 等距抽取在 4000 点缩到 600 点时，落在采样点之间的毛刺、过冲、单点跳变会整个消失，
// 而波形的纵轴范围也是从抽样结果算出来的——尖峰被丢掉会让纵轴一起缩小，
// 用户看到一条"干净"的波形且无从察觉它是失真的。
//
// 所以这里的断言方式是：构造带尖峰的信号，要求包络抽取后极值仍在结果里，
// 并同时验证等距抽取确实会丢——如果等距也没丢，说明这个用例没有区分度。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { downsampleIndices, downsampleEnvelopeIndices } = await server.ssrLoadModule("/src/lib/downsampling.ts");

  const COUNT = 4000;
  const LIMIT = 600;

  // 尖峰位置不能凭感觉挑：等距抽取本来就会命中一部分下标，挑中了用例就失去区分度
  // （初版用 [7, 123, ...]，其中 7 恰好被等距命中，导致"等距会压缩纵轴"的断言不成立）。
  // 这里改为先算出等距采样点集，再把尖峰放在它一定取不到的位置上。
  const naiveIndices = downsampleIndices(0, COUNT, LIMIT);
  const naiveSet = new Set(naiveIndices);
  const SPIKE_AT = [];
  for (let index = 5; index < COUNT - 5 && SPIKE_AT.length < 5; index += 731) {
    let candidate = index;
    while (naiveSet.has(candidate) && candidate < COUNT - 5) candidate += 1;
    if (!naiveSet.has(candidate)) SPIKE_AT.push(candidate);
  }
  assert.equal(SPIKE_AT.length, 5, "未能构造出等距抽取取不到的尖峰位置");

  const signal = Array.from({ length: COUNT }, (_, i) => Math.sin(i / 50));
  for (const at of SPIKE_AT) signal[at] = 100;

  const valueAt = (index) => signal[index];

  // 1) 包络必须保住每一个尖峰
  {
    const kept = downsampleEnvelopeIndices(0, COUNT, LIMIT, 1, valueAt);
    const keptSet = new Set(kept);
    for (const at of SPIKE_AT) {
      assert.ok(keptSet.has(at), `包络抽取丢掉了下标 ${at} 处的尖峰`);
    }

    // 2) 等距抽取必须全部丢掉——证明这个用例确实有区分度
    for (const at of SPIKE_AT) {
      assert.ok(!naiveSet.has(at), `用例构造有误：等距抽取命中了下标 ${at}`);
    }
    console.log(`  尖峰保留：包络 ${SPIKE_AT.length}/${SPIKE_AT.length}，等距 0/${SPIKE_AT.length}`);

    // 3) 极值本身也必须能从抽样结果里还原出来（纵轴范围依赖它）
    const envMax = Math.max(...kept.map(valueAt));
    const naiveMax = Math.max(...naiveIndices.map(valueAt));
    assert.equal(envMax, 100, "包络抽样结果的最大值应等于真实最大值");
    assert.ok(naiveMax < 100, `等距抽样结果的最大值应低于真实值，实际 ${naiveMax}`);
    console.log(`  纵轴极值：包络 ${envMax}，等距 ${naiveMax.toFixed(3)}（真实 100）`);
  }

  // 4) 负向尖峰同样要保住（只保 max 不保 min 是常见实现错误）
  {
    const withDip = signal.slice();
    withDip[1500] = -100;
    const kept = new Set(downsampleEnvelopeIndices(0, COUNT, LIMIT, 1, (i) => withDip[i]));
    assert.ok(kept.has(1500), "包络抽取丢掉了负向尖峰");
  }

  // 5) 多通道：尖峰只出现在其中一路，也不能丢
  {
    const chA = Array.from({ length: COUNT }, (_, i) => Math.sin(i / 50));
    const chB = Array.from({ length: COUNT }, (_, i) => Math.cos(i / 30));
    chB[2222] = 999; // 只有 B 路有尖峰
    const kept = new Set(
      downsampleEnvelopeIndices(0, COUNT, LIMIT, 2, (index, channel) => (channel === 0 ? chA[index] : chB[index]))
    );
    assert.ok(kept.has(2222), "多通道时丢掉了只出现在第二路的尖峰");
  }

  // 6) 输出规模必须受控，否则等于没有降采样
  {
    for (const channelCount of [1, 2, 4, 8, 20]) {
      const kept = downsampleEnvelopeIndices(0, COUNT, LIMIT, channelCount, valueAt);
      assert.ok(kept.length <= LIMIT + 2, `channelCount=${channelCount} 时输出 ${kept.length} 点，超过上限 ${LIMIT}+2`);
    }
    console.log("  输出规模在 1/2/4/8/20 通道下均受控");
  }

  // 7) 下标必须升序且不重复（绘制依赖顺序）
  {
    const kept = downsampleEnvelopeIndices(0, COUNT, LIMIT, 3, valueAt);
    for (let i = 1; i < kept.length; i += 1) {
      assert.ok(kept[i] > kept[i - 1], `下标未严格升序：${kept[i - 1]} -> ${kept[i]}`);
    }
  }

  // 8) 首尾始终保留，否则缩放/平移时波形两端会跳动
  {
    const kept = downsampleEnvelopeIndices(100, 500, LIMIT, 1, valueAt);
    assert.equal(kept[0], 100, "窗口首点应保留");
    assert.equal(kept[kept.length - 1], 599, "窗口尾点应保留");
  }

  // 9) 边界情形：点数不超过上限时应原样返回，与等距抽取一致
  {
    for (const [count, limit] of [
      [0, 600],
      [1, 600],
      [50, 600],
      [600, 600],
    ]) {
      const kept = downsampleEnvelopeIndices(0, count, limit, 2, valueAt);
      assert.deepEqual(kept, downsampleIndices(0, count, limit), `count=${count} limit=${limit} 应退回等距抽取`);
    }
  }

  // 10) 通道数为 0 或值全为非有限时不应崩溃
  {
    assert.deepEqual(
      downsampleEnvelopeIndices(0, COUNT, LIMIT, 0, valueAt),
      downsampleIndices(0, COUNT, LIMIT),
      "无通道信息时应退回等距抽取"
    );
    const nan = downsampleEnvelopeIndices(0, COUNT, LIMIT, 1, () => Number.NaN);
    assert.ok(nan.length >= 2, "全为非有限值时仍应至少保留首尾");
  }

  console.log("包络降采样检查通过");
} finally {
  await server.close();
}
