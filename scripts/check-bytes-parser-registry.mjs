// 字节流解析器进注册表后的端到端验证。
//
// JustFloat 原先焊死在 SerialReceivePipeline 里，现在作为 kind:"bytes" 的解析器
// 注册在统一注册表中。这里用合成的真实 JustFloat 字节流（小端 float32 + 帧尾
// 00 00 80 7F）把整条链路跑通，确认：
//   - 数值逐位正确，不是"没报错就算过"
//   - 帧被任意切分时跨分片残包仍能拼回
//   - 自动建通道、通道映射、错帧计数与改造前一致
//   - 文本解析器不受影响，且字节流解析器不会被误当作文本解析器调用
//   - chartTypes 里的内置字节流模式集合与注册表不漂移
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { DEFAULT_CHART_CONFIG, migrateChartConfig, isBytesParseMode } =
    await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { listChartParsers, getChartParser, parseChartData } = await server.ssrLoadModule("/src/lib/parseChartData.ts");
  const { SerialReceivePipeline } = await server.ssrLoadModule("/src/lib/serialReceivePipeline.ts");
  const { DEFAULT_RX_FRAMING } = await server.ssrLoadModule("/src/lib/serialTypes.ts");

  const TAIL = [0x00, 0x00, 0x80, 0x7f];

  /** 造一帧 JustFloat：若干小端 float32 + 4 字节帧尾 */
  function frame(...values) {
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));
    return [...bytes, ...TAIL];
  }

  // float32 会损失精度，比较时用它作为期望值
  const asF32 = (value) => {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, true);
    return view.getFloat32(0, true);
  };

  // ---- 1) 注册表结构 ----
  {
    const parsers = listChartParsers();
    const justfloat = parsers.find((p) => p.id === "justfloat");
    assert.ok(justfloat, "JustFloat 应已注册进解析器注册表");
    assert.equal(justfloat.kind, "bytes", "JustFloat 应是字节流解析器");
    assert.equal(typeof justfloat.createStream, "function", "字节流解析器应提供 createStream");

    // 文本解析器仍在，且都带 kind 标记
    for (const id of ["delimiter", "json", "kv", "regex"]) {
      const parser = parsers.find((p) => p.id === id);
      assert.ok(parser, `${id} 解析器应仍在注册表`);
      assert.equal(parser.kind, "text", `${id} 应是文本解析器`);
    }
    console.log(
      `  注册表：${parsers.length} 个解析器（文本 ${parsers.filter((p) => p.kind === "text").length}，字节流 ${parsers.filter((p) => p.kind === "bytes").length}）`
    );
  }

  // ---- 2) chartTypes 的内置字节流集合不能与注册表漂移 ----
  {
    const fromRegistry = listChartParsers()
      .filter((p) => p.kind === "bytes")
      .map((p) => p.id)
      .filter((id) => !id.startsWith("plugin:"))
      .sort();
    for (const id of fromRegistry) {
      assert.ok(isBytesParseMode(id), `注册表里的字节流模式 ${id} 未登记进 chartTypes 的 BYTES_PARSE_MODES`);
    }
    // 反向：登记了但注册表没有的，说明集合有多余项
    for (const id of ["binary", "justfloat", "slcan", "modbus-rtu", "modbus-ascii", "modbus-tcp"]) {
      assert.equal(isBytesParseMode(id), fromRegistry.includes(id), `${id} 在两处的判定不一致`);
    }
    console.log(`  内置字节流模式与注册表一致：${fromRegistry.join(", ")}`);
  }

  // ---- 3) 字节流解析器不能被当成文本解析器调用 ----
  {
    const config = { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "justfloat" };
    const result = parseChartData("1,2,3", config, 1000);
    assert.equal(result.success, false, "按行调用字节流解析器应失败而不是静默出错");
    assert.ok(/原始字节流/.test(result.error), `错误信息应说明原因，实际: ${result.error}`);
  }

  // ---- 4) 端到端：合成数据过 SerialReceivePipeline ----
  const config = {
    framing: DEFAULT_RX_FRAMING,
    chartConfig: { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "justfloat", channels: [] },
  };

  // 4a) 单帧：自动建通道 + 数值正确
  {
    const pipeline = new SerialReceivePipeline();
    const result = pipeline.ingest(
      { direction: "rx", chunks: [{ data: frame(1.5, -2.25, 3.75), timestamp: 1000 }] },
      config
    );
    assert.ok(result.detectedChannels, "首帧应自动推断出通道");
    assert.equal(result.detectedChannels.length, 3, "应识别出 3 个通道");
    assert.deepEqual(
      result.detectedChannels.map((c) => c.key),
      ["ch1", "ch2", "ch3"]
    );
    assert.equal(result.telemetryBatch.points.length, 1);
    assert.deepEqual(result.telemetryBatch.points[0].values, {
      ch1: asF32(1.5),
      ch2: asF32(-2.25),
      ch3: asF32(3.75),
    });
    assert.equal(result.telemetryBatch.success, 1);
    assert.equal(result.telemetryBatch.fail, 0);
    console.log("  单帧：自动建 3 通道，数值逐位正确");
  }

  // 4b) 多帧连发 + 逐字节切分：跨分片残包必须拼得回来
  {
    const values = [
      [0, 1, 2],
      [-1.5, 100.25, -0.125],
      [3.5, 4.5, 5.5],
      [1e-3, -1e3, 0.5],
    ];
    const stream = values.flatMap((v) => frame(...v));

    for (const chunkSize of [1, 2, 3, 5, 7, 16, stream.length]) {
      const pipeline = new SerialReceivePipeline();
      const points = [];
      let channels;
      let cfg = config;
      for (let offset = 0; offset < stream.length; offset += chunkSize) {
        const result = pipeline.ingest(
          { direction: "rx", chunks: [{ data: stream.slice(offset, offset + chunkSize), timestamp: 2000 }] },
          cfg
        );
        if (result.detectedChannels) {
          channels = result.detectedChannels;
          cfg = { ...cfg, chartConfig: { ...cfg.chartConfig, channels } };
        }
        points.push(...result.telemetryBatch.points);
      }
      assert.equal(points.length, values.length, `chunkSize=${chunkSize}: 应解析出 ${values.length} 帧`);
      values.forEach((expected, index) => {
        assert.deepEqual(
          points[index].values,
          { ch1: asF32(expected[0]), ch2: asF32(expected[1]), ch3: asF32(expected[2]) },
          `chunkSize=${chunkSize} 第 ${index} 帧数值不对`
        );
      });
    }
    console.log("  多帧跨分片：1/2/3/5/7/16/整包 七种切分下数值全部一致");
  }

  // 4c) 错帧（载荷长度非 4 的倍数）应被计入 fail 而不是崩掉
  {
    const pipeline = new SerialReceivePipeline();
    const malformed = [0x01, 0x02, 0x03, ...TAIL]; // 3 字节载荷
    const result = pipeline.ingest({ direction: "rx", chunks: [{ data: malformed, timestamp: 3000 }] }, config);
    assert.equal(result.telemetryBatch.points.length, 0, "错帧不应产出数据点");
    assert.ok(result.telemetryBatch.fail > 0, "错帧应被计入 fail");
  }

  // 4d) 发送方向不应参与字节流解析（发出去的不是设备上报的遥测）
  {
    const pipeline = new SerialReceivePipeline();
    const result = pipeline.ingest(
      { direction: "tx", chunks: [{ data: frame(9.0, 9.0, 9.0), timestamp: 4000 }] },
      config
    );
    assert.equal(result.telemetryBatch.points.length, 0, "tx 方向不应产出遥测点");
  }

  // 4e) reset 后切到文本解析器：字节流残包必须被清干净
  //
  // 注意文本分帧是无条件执行的（改造前后都如此），所以二进制字节同样会进文本缓冲。
  // 不 reset 直接切模式时，遗留的二进制字节会和后续文本拼成一行——那是既有行为，
  // 不是本次改造引入的。真实场景里停止/断开/切换来源都会走 reset，这里照此验证。
  {
    const pipeline = new SerialReceivePipeline();
    pipeline.ingest({ direction: "rx", chunks: [{ data: frame(1, 2, 3).slice(0, 5) }] }, config); // 故意留半帧
    pipeline.reset();
    const textConfig = {
      framing: DEFAULT_RX_FRAMING,
      chartConfig: {
        ...DEFAULT_CHART_CONFIG,
        enabled: true,
        parseMode: "json",
        channels: [{ key: "a", name: "a", color: "#000", visible: true, role: "y" }],
      },
    };
    const encoder = new TextEncoder();
    const result = pipeline.ingest(
      { direction: "rx", chunks: [{ data: Array.from(encoder.encode('{"a":42}\n')), timestamp: 5000 }] },
      textConfig
    );
    const parsed = result.telemetryBatch.points.filter((p) => p.values.a === 42);
    assert.equal(parsed.length, 1, "切到 JSON 后应能正常解析文本");
  }

  // ---- 5) migrateChartConfig 对只支持文本的来源仍会回退字节流模式 ----
  {
    const stored = { ...DEFAULT_CHART_CONFIG, parseMode: "justfloat" };
    assert.equal(migrateChartConfig(stored, true).parseMode, "justfloat", "允许字节流时应保留");
    assert.notEqual(migrateChartConfig(stored, false).parseMode, "justfloat", "不允许字节流时应回退");
    assert.equal(getChartParser("justfloat").kind, "bytes");
  }

  // ---- 6) TelemetryParseDispatcher：三条来源共用的解析分派器 ----
  {
    const { TelemetryParseDispatcher } = await server.ssrLoadModule("/src/lib/chartIngestion.ts");
    const bytesConfig = { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "justfloat", channels: [] };
    const textConfig = { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "json", channels: [] };

    // 6a) 模式判别
    {
      const d = new TelemetryParseDispatcher();
      assert.equal(d.usesBytesParser(bytesConfig), true);
      assert.equal(d.usesBytesParser(textConfig), false);
      assert.equal(d.usesBytesParser({ ...bytesConfig, enabled: false }), false, "未启用图表时不应走字节流");
      assert.equal(d.ingestBytes([1, 2, 3], textConfig, 0), null, "文本模式应返回 null 让调用方走文本路径");
    }

    // 6b) 按通道隔离：这是 RTT 最关键的性质。
    //     两个通道各自收到半帧，若共用一个解析器，残包会串在一起解出错误数值。
    {
      const chA = new TelemetryParseDispatcher();
      const chB = new TelemetryParseDispatcher();
      const frameA = frame(11.5, 22.5);
      const frameB = frame(-33.5, -44.5);
      const cfg = { ...bytesConfig, channels: [] };

      // 交错喂入两条流的前半段
      assert.equal(chA.ingestBytes(frameA.slice(0, 3), cfg, 100).points.length, 0);
      assert.equal(chB.ingestBytes(frameB.slice(0, 5), cfg, 100).points.length, 0);

      // 再各自补完后半段
      const restA = chA.ingestBytes(frameA.slice(3), cfg, 200);
      const restB = chB.ingestBytes(frameB.slice(5), cfg, 200);

      assert.equal(restA.points.length, 1, "通道 A 应解出 1 帧");
      assert.equal(restB.points.length, 1, "通道 B 应解出 1 帧");

      const cfgA = { ...cfg, channels: restA.detectedChannels };
      const cfgB = { ...cfg, channels: restB.detectedChannels };
      assert.equal(cfgA.channels.length, 2);
      assert.equal(cfgB.channels.length, 2);

      // 数值必须各归各的，没有串流
      const reA = new TelemetryParseDispatcher().ingestBytes(frameA, cfgA, 300);
      const reB = new TelemetryParseDispatcher().ingestBytes(frameB, cfgB, 300);
      assert.deepEqual(reA.points[0].values, { ch1: asF32(11.5), ch2: asF32(22.5) });
      assert.deepEqual(reB.points[0].values, { ch1: asF32(-33.5), ch2: asF32(-44.5) });
      console.log("  按通道隔离：交错半帧不串流，数值各归各");
    }

    // 6c) 切换解析模式后残包必须丢弃，不能带进新解析器
    {
      const d = new TelemetryParseDispatcher();
      d.ingestBytes(frame(1, 2).slice(0, 4), bytesConfig, 100); // 留半帧
      assert.equal(d.ingestBytes([], textConfig, 200), null, "切到文本模式应返回 null");
      // 切回字节流：应是全新解析器，之前的半帧不该再冒出来
      const after = d.ingestBytes(frame(7.5, 8.5), { ...bytesConfig, channels: [] }, 300);
      assert.equal(after.points.length, 1, "切回后应只解出新喂入的那一帧");
      const cfg = { ...bytesConfig, channels: after.detectedChannels };
      const verify = new TelemetryParseDispatcher().ingestBytes(frame(7.5, 8.5), cfg, 400);
      assert.deepEqual(verify.points[0].values, { ch1: asF32(7.5), ch2: asF32(8.5) });
    }

    // 6d) reset 清空残包
    {
      const d = new TelemetryParseDispatcher();
      const f = frame(5.5, 6.5);
      d.ingestBytes(f.slice(0, 6), bytesConfig, 100);
      d.reset();
      const after = d.ingestBytes(f.slice(6), { ...bytesConfig, channels: [] }, 200);
      assert.equal(after.points.length, 0, "reset 后残包应被丢弃，半帧尾巴不该拼出完整帧");
    }
    console.log("  分派器：模式判别 / 通道隔离 / 切换重建 / reset 均正确");
  }

  console.log("字节流解析器注册表检查通过");
} finally {
  await server.close();
}
