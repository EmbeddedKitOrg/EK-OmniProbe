// 接收分帧设置此前只有串口可配，RTT 与 BLE 恒用默认的 auto/LF。
// 本检查守住三条来源的行为一致：同样的分帧配置，切出来的行必须相同。
//
// 这条能力落差是这一轮反复出现的模式（「串口是一等公民」）的最后一处，
// 补齐之后要防的是以后只给其中一条加分帧模式、另两条忘了。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { TextFrameStream } = await server.ssrLoadModule("/src/lib/dataFraming.ts");
  const { DEFAULT_RX_FRAMING } = await server.ssrLoadModule("/src/lib/serialTypes.ts");
  const { useSerialStore } = await server.ssrLoadModule("/src/stores/serialStore.ts");
  const { useRttStore } = await server.ssrLoadModule("/src/stores/rttStore.ts");
  const { useBluetoothStore } = await server.ssrLoadModule("/src/stores/bluetoothStore.ts");

  const encoder = new TextEncoder();
  const bytesOf = (text) => Array.from(encoder.encode(text));

  const STORES = [
    ["serial", useSerialStore],
    ["rtt", useRttStore],
    ["bluetooth", useBluetoothStore],
  ];

  // ---- 1) 三条来源都有 rxFraming 状态与 setter，且默认值一致 ----
  {
    for (const [name, store] of STORES) {
      const state = store.getState();
      assert.ok(state.rxFraming, `${name} 应有 rxFraming 状态`);
      assert.equal(typeof state.setRxFraming, "function", `${name} 应有 setRxFraming`);
      assert.deepEqual(state.rxFraming, DEFAULT_RX_FRAMING, `${name} 的默认分帧设置应与其余来源一致`);
    }
    console.log("  三条来源均有 rxFraming，默认值一致");
  }

  // ---- 2) setter 应做局部合并而不是整体替换 ----
  {
    for (const [name, store] of STORES) {
      store.getState().setRxFraming({ mode: "custom" });
      const after = store.getState().rxFraming;
      assert.equal(after.mode, "custom", `${name} 的 mode 应被更新`);
      assert.equal(after.idleMs, DEFAULT_RX_FRAMING.idleMs, `${name} 未指定的字段应保留原值`);

      store.getState().setRxFraming({ customDelimiter: "##", customIsHex: false });
      const merged = store.getState().rxFraming;
      assert.equal(merged.mode, "custom", `${name} 二次设置不应覆盖掉之前的 mode`);
      assert.equal(merged.customDelimiter, "##");

      // 还原，避免影响后续用例
      store.getState().setRxFraming(DEFAULT_RX_FRAMING);
    }
    console.log("  setRxFraming 为局部合并，未指定字段保留");
  }

  // ---- 3) 同一份配置在三条来源上必须切出相同的行 ----
  //
  // 这里直接驱动 TextFrameStream——它是三条来源共用的分帧实现，
  // 各 hook 只是把自己 store 里的配置传进来。因此配置一致即行为一致。
  {
    const cases = [
      { framing: { ...DEFAULT_RX_FRAMING, mode: "lf" }, input: "a\nb\nc\n", expect: ["a", "b", "c"] },
      { framing: { ...DEFAULT_RX_FRAMING, mode: "crlf" }, input: "a\r\nb\r\n", expect: ["a", "b"] },
      { framing: { ...DEFAULT_RX_FRAMING, mode: "cr" }, input: "a\rb\r", expect: ["a", "b"] },
      {
        framing: { ...DEFAULT_RX_FRAMING, mode: "custom", customDelimiter: "##", customIsHex: false },
        input: "a##b##",
        expect: ["a", "b"],
      },
      {
        framing: { ...DEFAULT_RX_FRAMING, mode: "custom", customDelimiter: "0D 0A", customIsHex: true },
        input: "a\r\nb\r\n",
        expect: ["a", "b"],
      },
      // timeout 模式不按分隔符切，全部留作残帧等空闲刷出
      { framing: { ...DEFAULT_RX_FRAMING, mode: "timeout" }, input: "abc", expect: [] },
    ];

    for (const { framing, input, expect } of cases) {
      const results = STORES.map(([name, store]) => {
        store.getState().setRxFraming(framing);
        const stream = new TextFrameStream();
        const lines = stream.ingest(bytesOf(input), 1000, "rx", store.getState().rxFraming);
        return [name, lines.map((line) => line.text)];
      });

      for (const [name, lines] of results) {
        assert.deepEqual(lines, expect, `${name} 在 ${framing.mode} 模式下切行结果不符：${JSON.stringify(lines)}`);
      }
      // 三条来源两两一致
      const [, first] = results[0];
      for (const [name, lines] of results.slice(1)) {
        assert.deepEqual(lines, first, `${name} 与 serial 的分帧结果不一致`);
      }
    }
    console.log(`  ${cases.length} 种分帧模式下三条来源切行结果完全一致`);
  }

  // ---- 4) 自定义分隔符为空时应退回不切分（避免空分隔符导致死循环）----
  {
    for (const [name, store] of STORES) {
      store.getState().setRxFraming({ mode: "custom", customDelimiter: "", customIsHex: false });
      const stream = new TextFrameStream();
      const lines = stream.ingest(bytesOf("abc"), 1000, "rx", store.getState().rxFraming);
      assert.deepEqual(lines, [], `${name}：空自定义分隔符不应切出任何行`);
      store.getState().setRxFraming(DEFAULT_RX_FRAMING);
    }
    console.log("  空自定义分隔符在三条来源上都安全退回不切分");
  }

  console.log("接收分帧三来源一致性检查通过");
} finally {
  await server.close();
}
