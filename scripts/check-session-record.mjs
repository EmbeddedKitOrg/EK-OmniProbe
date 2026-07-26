// 会话录制与回放。
//
// 核心承诺只有一条：**回放录制的会话，必须得到与实时采集完全相同的遥测结果**。
// 否则"拿同一段原始数据对比不同滤波配置"这件事就不成立——你不知道差异是来自
// 配置还是来自回放本身失真。
//
// 因此这里的验证方式是：同一批合成字节，一路直接喂管线（模拟实时），一路先录制
// 再序列化再解析再喂管线（模拟回放），逐点比对两者产出。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { SessionRecorder, parseSessionFile, streamSessionChunks, bytesToBase64, base64ToBytes, SESSION_SCHEMA } =
    await server.ssrLoadModule("/src/lib/sessionRecord.ts");
  const { SerialReceivePipeline } = await server.ssrLoadModule("/src/lib/serialReceivePipeline.ts");
  const { DEFAULT_CHART_CONFIG } = await server.ssrLoadModule("/src/lib/chartTypes.ts");
  const { DEFAULT_RX_FRAMING } = await server.ssrLoadModule("/src/lib/serialTypes.ts");

  const TAIL = [0x00, 0x00, 0x80, 0x7f];
  const encoder = new TextEncoder();

  function justFloatFrame(...values) {
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));
    return [...bytes, ...TAIL];
  }

  // ---- 1) base64 编解码必须对全部 256 个字节值无损 ----
  {
    const allBytes = Array.from({ length: 256 }, (_, i) => i);
    assert.deepEqual(base64ToBytes(bytesToBase64(allBytes)), allBytes, "0..255 全字节值应无损往返");

    // 大数组：分块编码的边界（BASE64_CHUNK = 0x8000）
    const big = Array.from({ length: 0x8000 * 2 + 123 }, (_, i) => i % 256);
    assert.deepEqual(base64ToBytes(bytesToBase64(big)), big, "跨分块边界的大数组应无损往返");
    assert.deepEqual(bytesToBase64([]), "", "空数组应编码为空串");
    console.log("  base64：0..255 全值 + 跨分块大数组均无损");
  }

  // ---- 2) 回放必须与实时采集逐点一致（文本协议）----
  {
    const chartConfig = {
      ...DEFAULT_CHART_CONFIG,
      enabled: true,
      parseMode: "json",
      channels: [
        { key: "a", name: "a", color: "#111", visible: true, role: "y" },
        { key: "b", name: "b", color: "#222", visible: true, role: "y" },
      ],
    };
    const config = { framing: DEFAULT_RX_FRAMING, chartConfig };

    // 造一串带碎片的到达序列：一行被切成多块，正是真实串口/无线的样子
    const payload = Array.from({ length: 40 }, (_, i) => JSON.stringify({ a: i, b: -i / 2 })).join("\n") + "\n";
    const allBytes = Array.from(encoder.encode(payload));
    const arrivals = [];
    for (let offset = 0, size = 1; offset < allBytes.length; offset += size, size = (size % 7) + 1) {
      arrivals.push({ data: allBytes.slice(offset, offset + size), timestamp: 1000 + arrivals.length * 3 });
    }

    // 实时：直接喂管线
    const livePipeline = new SerialReceivePipeline();
    const livePoints = [];
    const recorder = new SessionRecorder();
    recorder.start(arrivals[0].timestamp);
    for (const arrival of arrivals) {
      const result = livePipeline.ingest({ direction: "rx", chunks: [arrival] }, config);
      livePoints.push(...result.telemetryBatch.points);
      recorder.record(arrival.data, arrival.timestamp);
    }

    // 回放：序列化 → 解析 → 重新喂管线
    const text = recorder.serialize({ source: "serial", chartConfig, framing: DEFAULT_RX_FRAMING });
    const session = parseSessionFile(text);
    assert.equal(session.header.schema, SESSION_SCHEMA);
    assert.equal(session.header.source, "serial");
    assert.equal(session.chunks.length, arrivals.length, "录制块数应与到达次数一致");

    const replayPipeline = new SerialReceivePipeline();
    const replayPoints = [];
    for (const chunk of session.chunks) {
      const result = replayPipeline.ingest(
        { direction: "rx", chunks: [{ data: chunk.d, timestamp: chunk.t }] },
        { framing: session.header.framing, chartConfig: session.header.chartConfig }
      );
      replayPoints.push(...result.telemetryBatch.points);
    }

    assert.equal(replayPoints.length, livePoints.length, "回放点数应与实时一致");
    livePoints.forEach((point, index) => {
      assert.deepEqual(replayPoints[index].values, point.values, `第 ${index} 点数值不一致`);
    });
    assert.equal(livePoints.length, 40, "本用例应解析出 40 个点");
    console.log(`  文本协议：${arrivals.length} 次碎片到达，回放 ${replayPoints.length} 点与实时逐点一致`);
  }

  // ---- 3) 二进制协议同样一致（base64 必须扛住任意字节）----
  {
    const chartConfig = { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "justfloat", channels: [] };
    const config = { framing: DEFAULT_RX_FRAMING, chartConfig };

    const values = [
      [1.5, -2.5, 3.5],
      [0, 0, 0],
      [-1e3, 1e-3, 12345.75],
      [0.125, -0.25, 0.5],
    ];
    const stream = values.flatMap((v) => justFloatFrame(...v));
    const arrivals = [];
    for (let offset = 0, size = 3; offset < stream.length; offset += size, size = (size % 5) + 1) {
      arrivals.push({ data: stream.slice(offset, offset + size), timestamp: 2000 + arrivals.length * 2 });
    }

    const runPipeline = (chunks, startConfig) => {
      const pipeline = new SerialReceivePipeline();
      const points = [];
      let cfg = startConfig;
      for (const chunk of chunks) {
        const result = pipeline.ingest({ direction: "rx", chunks: [chunk] }, cfg);
        if (result.detectedChannels) {
          cfg = { ...cfg, chartConfig: { ...cfg.chartConfig, channels: result.detectedChannels } };
        }
        points.push(...result.telemetryBatch.points);
      }
      return points;
    };

    const livePoints = runPipeline(arrivals, config);
    const recorder = new SessionRecorder();
    recorder.start(arrivals[0].timestamp);
    for (const arrival of arrivals) recorder.record(arrival.data, arrival.timestamp);

    const session = parseSessionFile(recorder.serialize({ source: "serial", chartConfig }));
    const replayPoints = runPipeline(
      session.chunks.map((chunk) => ({ data: chunk.d, timestamp: chunk.t })),
      { framing: DEFAULT_RX_FRAMING, chartConfig: session.header.chartConfig }
    );

    assert.equal(livePoints.length, values.length, "实时应解析出全部帧");
    assert.equal(replayPoints.length, livePoints.length, "回放帧数应与实时一致");
    livePoints.forEach((point, index) => {
      assert.deepEqual(replayPoints[index].values, point.values, `二进制第 ${index} 帧不一致`);
    });
    console.log(`  二进制协议：${arrivals.length} 次碎片到达，回放 ${replayPoints.length} 帧与实时逐点一致`);
  }

  // ---- 4) 换一套滤波配置回放：原始数据不变，这是这个功能存在的意义 ----
  {
    const recorded = { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "json", channels: [] };
    const recorder = new SessionRecorder();
    recorder.start(1000);
    recorder.record(Array.from(encoder.encode('{"v":1}\n{"v":2}\n')), 1000);

    const session = parseSessionFile(recorder.serialize({ source: "serial", chartConfig: recorded }));
    // 回放时套用一份新的通道配置，原始字节完全不受影响
    const newConfig = {
      ...session.header.chartConfig,
      channels: [{ key: "v", name: "V", color: "#333", visible: true, role: "y" }],
    };
    const pipeline = new SerialReceivePipeline();
    const result = pipeline.ingest(
      { direction: "rx", chunks: session.chunks.map((c) => ({ data: c.d, timestamp: c.t })) },
      { framing: DEFAULT_RX_FRAMING, chartConfig: newConfig }
    );
    assert.deepEqual(
      result.telemetryBatch.points.map((p) => p.values.v),
      [1, 2],
      "应能用新配置重新解析同一份原始字节"
    );
  }

  // ---- 5) RTT 通道号要能录进去并原样取回 ----
  {
    const recorder = new SessionRecorder();
    recorder.start(0);
    recorder.record([1, 2, 3], 10, 0);
    recorder.record([4, 5, 6], 20, 1);
    recorder.record([7, 8, 9], 30); // 无通道
    const session = parseSessionFile(recorder.serialize({ source: "rtt", chartConfig: DEFAULT_CHART_CONFIG }));
    assert.equal(session.header.source, "rtt");
    assert.deepEqual(
      session.chunks.map((c) => c.ch),
      [0, 1, undefined]
    );
    assert.deepEqual(
      session.chunks.map((c) => c.t),
      [10, 20, 30],
      "时间戳应为相对录制起点的毫秒数"
    );
  }

  // ---- 6) 上限保护：超限后停止追加并标记截断，而不是静默丢数据 ----
  {
    const recorder = new SessionRecorder(1000);
    recorder.start(0);
    for (let i = 0; i < 20; i += 1) recorder.record(new Array(100).fill(0x41), i);
    assert.ok(recorder.isTruncated, "超出上限应置截断标记");
    assert.ok(recorder.byteCount <= 1000, `字节数应不超过上限，实际 ${recorder.byteCount}`);
  }

  // ---- 7) 损坏文件的处理 ----
  {
    assert.throws(() => parseSessionFile(""), /为空/, "空文件应报错");
    assert.throws(() => parseSessionFile("not json"), /不是合法 JSON/, "首行非 JSON 应报错");
    assert.throws(() => parseSessionFile('{"schema":"other/v1"}'), /不支持的会话文件格式/, "schema 不符应报错");
    assert.throws(() => parseSessionFile('{"schema":"ek.session/v1"}'), /缺少解析配置/, "缺配置应报错");

    // 中间损坏的数据行应被跳过，而不是让整个文件读不了
    const recorder = new SessionRecorder();
    recorder.start(0);
    recorder.record([1, 2], 0);
    recorder.record([3, 4], 10);
    const text = recorder.serialize({ source: "serial", chartConfig: DEFAULT_CHART_CONFIG });
    const lines = text.split("\n");
    lines.splice(2, 0, "{损坏的一行");
    const session = parseSessionFile(lines.join("\n"));
    assert.equal(session.chunks.length, 2, "损坏行应被跳过，其余数据仍可读出");
    console.log("  损坏文件：首行/schema/缺配置均明确报错，中间损坏行跳过后继续");
  }

  // ---- 8) 流式读取与一次性解析结果一致 ----
  {
    const recorder = new SessionRecorder();
    recorder.start(0);
    for (let i = 0; i < 1500; i += 1) recorder.record([i % 256, (i * 7) % 256], i);
    const text = recorder.serialize({ source: "serial", chartConfig: DEFAULT_CHART_CONFIG });

    const oneShot = parseSessionFile(text);
    const streamed = { header: null, chunks: [] };
    for await (const item of streamSessionChunks(new Blob([text]), 128)) {
      if ("header" in item) streamed.header = item.header;
      else streamed.chunks.push(...item.chunks);
    }
    assert.deepEqual(streamed.header, oneShot.header, "流式读取的头应与一次性解析一致");
    assert.equal(streamed.chunks.length, oneShot.chunks.length, "流式读取的块数应一致");
    assert.deepEqual(streamed.chunks, oneShot.chunks, "流式读取的内容应逐块一致");
    console.log(`  流式读取：${streamed.chunks.length} 块与一次性解析完全一致`);
  }

  // ---- 9) replaySession：串口回放入口 ----
  {
    const { replaySession } = await server.ssrLoadModule("/src/lib/sessionCapture.ts");
    const chartConfig = {
      ...DEFAULT_CHART_CONFIG,
      enabled: true,
      parseMode: "json",
      channels: [{ key: "v", name: "V", color: "#333", visible: true, role: "y" }],
    };

    // 末尾故意不带换行：靠 flushPending 刷出，否则最后一行会丢
    const recorder = new SessionRecorder();
    recorder.start(0);
    recorder.record(Array.from(encoder.encode('{"v":1}\n{"v":2}\n{"v":3}')), 0);
    const text = recorder.serialize({ source: "serial", chartConfig, framing: DEFAULT_RX_FRAMING });

    const replayed = replaySession(text);
    assert.deepEqual(
      replayed.result.telemetryBatch.points.map((p) => p.values.v),
      [1, 2, 3],
      "末尾无换行的那一行也应通过 flushPending 刷出"
    );
    assert.equal(replayed.chunkCount, 1);
    assert.equal(replayed.header.source, "serial");

    // 用不同配置回放同一份字节——这正是该功能存在的意义
    const overridden = replaySession(text, {
      ...chartConfig,
      channels: [{ key: "v", name: "重命名", color: "#999", visible: true, role: "y" }],
    });
    assert.deepEqual(
      overridden.result.telemetryBatch.points.map((p) => p.values.v),
      [1, 2, 3],
      "换配置回放应仍能解析出同样的原始数值"
    );

    // 二进制会话回放：通道要在首帧推断后沿用到后续块
    const binConfig = { ...DEFAULT_CHART_CONFIG, enabled: true, parseMode: "justfloat", channels: [] };
    const binRecorder = new SessionRecorder();
    binRecorder.start(0);
    const binStream = [justFloatFrame(1.5, 2.5), justFloatFrame(3.5, 4.5), justFloatFrame(5.5, 6.5)];
    binStream.forEach((f, i) => binRecorder.record(f, i * 10));
    const binReplayed = replaySession(binRecorder.serialize({ source: "serial", chartConfig: binConfig }));
    assert.equal(binReplayed.result.telemetryBatch.points.length, 3, "三帧二进制都应回放出来");
    assert.deepEqual(binReplayed.result.telemetryBatch.points[2].values, { ch1: 5.5, ch2: 6.5 });
    console.log("  replaySession：末尾残帧刷出、换配置回放、二进制通道沿用均正确");
  }

  // ---- 10) RTT 会话按通道分别回放：跨通道的半帧不能被接成一帧 ----
  {
    const { replaySession } = await server.ssrLoadModule("/src/lib/sessionCapture.ts");
    const chartConfig = {
      ...DEFAULT_CHART_CONFIG,
      enabled: true,
      parseMode: "json",
      channels: [{ key: "v", name: "V", color: "#333", visible: true, role: "y" }],
    };

    // 两个 RTT 通道交错到达，且各自都被切成半行。
    // 若回放时不按通道分组，通道 0 的 '{"v":1' 会和通道 1 的 '{"v":9' 拼在一起，
    // 解析出完全错误的结果或直接失败。
    const recorder = new SessionRecorder();
    recorder.start(0);
    recorder.record(Array.from(encoder.encode('{"v":1')), 0, 0);
    recorder.record(Array.from(encoder.encode('{"v":9')), 1, 1);
    recorder.record(Array.from(encoder.encode("}\n")), 2, 0);
    recorder.record(Array.from(encoder.encode("}\n")), 3, 1);

    const replayed = replaySession(recorder.serialize({ source: "rtt", chartConfig }));
    assert.deepEqual(replayed.channels, [0, 1], "应识别出会话里出现过的两个通道");

    const values = replayed.result.telemetryBatch.points.map((p) => p.values.v).sort((a, b) => a - b);
    assert.deepEqual(values, [1, 9], `跨通道半帧应各自拼回，实际 ${JSON.stringify(values)}`);
    assert.equal(replayed.result.telemetryBatch.fail, 0, "不应出现解析失败");
    console.log("  RTT 按通道回放：两通道交错半帧各自拼回，未串流");
  }

  console.log("会话录制与回放检查通过");
} finally {
  await server.close();
}
