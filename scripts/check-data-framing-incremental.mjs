// dataFraming.ts 的分帧改成了增量扫描：新分片到达时不再把 pending+新数据
// 全部重新扫一遍找分隔符，只重扫跨分片边界那 delimiter.length-1 个字节。
// 这是接收链路的核心逻辑，错一点就会丢帧/断帧/重复帧，比性能问题严重得多，
// 所以这里用暴力的「每次全量重扫」实现做基准，在大量随机分片方式下逐字节比对。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { parseSerialData, TextFrameStream } = await server.ssrLoadModule("/src/lib/dataFraming.ts");

  const encoder = new TextEncoder();
  const bytesOf = (text) => Array.from(encoder.encode(text));

  // 暴力基准：完全不依赖 searchFrom 优化，每次都从 0 开始扫描全部字节。
  // 直接复刻优化前的算法（全量 concat + 从 0 扫描），作为独立的正确性来源。
  function bruteForceSplit(bytes, delimiter) {
    const frames = [];
    let start = 0;
    let index = 0;
    while (index + delimiter.length <= bytes.length) {
      let matched = true;
      for (let offset = 0; offset < delimiter.length; offset += 1) {
        if (bytes[index + offset] !== delimiter[offset]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        frames.push(bytes.slice(start, index));
        index += delimiter.length;
        start = index;
      } else {
        index += 1;
      }
    }
    return { frames, rest: bytes.slice(start) };
  }

  function bruteForceParse(chunks, framing) {
    let pendingRaw = [];
    const allLines = [];
    for (const chunk of chunks) {
      const full = pendingRaw.concat(chunk);
      if (framing.mode === "timeout") {
        pendingRaw = full;
        continue;
      }
      const delimiter =
        framing.mode === "lf"
          ? [0x0a]
          : framing.mode === "crlf"
            ? [0x0d, 0x0a]
            : framing.mode === "cr"
              ? [0x0d]
              : framing.mode === "custom"
                ? bytesOf(framing.customDelimiter)
                : [0x0a]; // auto
      const stripTrailingCr = framing.mode === "auto";
      const { frames, rest } = bruteForceSplit(full, delimiter);
      for (let frameBytes of frames) {
        if (stripTrailingCr && frameBytes[frameBytes.length - 1] === 0x0d) frameBytes = frameBytes.slice(0, -1);
        if (frameBytes.length === 0) continue;
        const text = Buffer.from(frameBytes).toString("utf8");
        if (!text.trim()) continue;
        allLines.push(text);
      }
      pendingRaw = rest;
    }
    return { lines: allLines, restLength: pendingRaw.length };
  }

  function incrementalParse(chunks, framing) {
    let pending = { rawData: [] };
    const allLines = [];
    for (const chunk of chunks) {
      const result = parseSerialData(chunk, Date.now(), "rx", pending, framing);
      pending = result.pending;
      for (const line of result.lines) allLines.push(line.text);
    }
    return { lines: allLines, restLength: pending.rawData.length };
  }

  // 把一串文本样本用给定分隔符拼起来，再切成随机分片（含单字节分片、
  // 跨越分隔符正中间的分片），模拟串口/RTT/TCP 真实到达时的碎片化。
  function chunkBytes(bytes, chunkSizes) {
    const chunks = [];
    let cursor = 0;
    let sizeIndex = 0;
    while (cursor < bytes.length) {
      const size = Math.max(1, chunkSizes[sizeIndex % chunkSizes.length]);
      chunks.push(bytes.slice(cursor, cursor + size));
      cursor += size;
      sizeIndex += 1;
    }
    return chunks;
  }

  const FRAMINGS = [
    { mode: "lf" },
    { mode: "crlf" },
    { mode: "cr" },
    { mode: "auto" },
    { mode: "custom", customDelimiter: "##", customIsHex: false },
    { mode: "custom", customDelimiter: "\x01\x02\x03", customIsHex: false }, // 3 字节分隔符
  ];

  const SAMPLE_LINES = [
    "温度=25.6,湿度=60",
    "",
    "   ",
    "a",
    "line with spaces in it",
    "こんにちは世界", // 多字节 UTF-8，故意让编码跨分片边界更容易踩坑
    "x".repeat(500), // 长行，制造更大的 pending 缓冲
  ];

  const CHUNK_SIZE_SETS = [
    [1], // 逐字节到达：对分隔符搜索的边界情况最严苛
    [2],
    [3],
    [1, 2, 3, 5, 8, 13], // 斐波那契式不规则分片
    [7, 1, 1, 1, 20],
    [1000], // 基本不分片，等价于一次性到达
  ];

  let cases = 0;
  for (const framing of FRAMINGS) {
    const delimiterText =
      framing.mode === "lf"
        ? "\n"
        : framing.mode === "crlf"
          ? "\r\n"
          : framing.mode === "cr"
            ? "\r"
            : framing.mode === "auto"
              ? "\n"
              : framing.customDelimiter;

    const joined = SAMPLE_LINES.join(delimiterText) + delimiterText; // 末尾也带分隔符，制造一个空尾帧
    const bytes = bytesOf(joined);

    for (const chunkSizes of CHUNK_SIZE_SETS) {
      const chunks = chunkBytes(bytes, chunkSizes);
      const brute = bruteForceParse(chunks, framing);
      const incremental = incrementalParse(chunks, framing);

      assert.deepEqual(
        incremental.lines,
        brute.lines,
        `framing=${JSON.stringify(framing)} chunks=${JSON.stringify(chunkSizes)}: 帧内容不一致\n` +
          `brute=${JSON.stringify(brute.lines)}\nincremental=${JSON.stringify(incremental.lines)}`
      );
      assert.equal(
        incremental.restLength,
        brute.restLength,
        `framing=${JSON.stringify(framing)} chunks=${JSON.stringify(chunkSizes)}: 残帧长度不一致`
      );
      cases += 1;
    }
  }
  console.log(`  分帧与暴力基准逐字节一致（${cases} 组 framing × chunking 组合）`);

  // 分隔符恰好卡在分片边界的极端情形（对 2/3 字节分隔符最关键）
  {
    const framing = { mode: "crlf" };
    const text = "AAA\r\nBBB\r\nCCC\r\n";
    const bytes = bytesOf(text);
    // 让每一种可能的切点都试一遍：在每个字节之后切一刀
    for (let cutPoint = 1; cutPoint < bytes.length; cutPoint += 1) {
      const chunks = [bytes.slice(0, cutPoint), bytes.slice(cutPoint)];
      const brute = bruteForceParse(chunks, framing);
      const incremental = incrementalParse(chunks, framing);
      assert.deepEqual(incremental.lines, brute.lines, `CRLF 在切点 ${cutPoint} 处不一致`);
    }
    console.log(`  CRLF 分隔符逐切点边界检查通过（${bytes.length - 1} 个切点）`);
  }

  // 残帧超限保护：连续送入远超 1MB 且不含分隔符的数据，不应抛异常或无限增长
  {
    const framing = { mode: "lf" };
    let pending = { rawData: [] };
    const chunk = new Array(4096).fill(0x41); // 全是 'A'，没有 LF
    let totalLines = 0;
    for (let i = 0; i < 400; i += 1) {
      // 400 * 4096 ≈ 1.6MB，超过 MAX_PENDING_BYTES（1MB）
      const result = parseSerialData(chunk, Date.now(), "rx", pending, framing);
      pending = result.pending;
      totalLines += result.lines.length;
      assert.ok(pending.rawData.length <= 1024 * 1024, `第 ${i} 批后残帧仍应有上限，实际 ${pending.rawData.length}`);
    }
    assert.ok(totalLines > 0, "超限时应至少被强制切出过一行，否则数据会无限堆积且从不显示");
  }

  // TextFrameStream：ingest + flush 组合，含 UTF-8 多字节字符跨分片
  {
    const stream = new TextFrameStream();
    const text = "第一行\n第二行\n残帧片段";
    const bytes = bytesOf(text);
    // 在多字节字符中间切一刀（"第"的 UTF-8 编码是 3 字节）
    const midCharCut = 4;
    const lines1 = stream.ingest(bytes.slice(0, midCharCut), Date.now(), "rx", { mode: "lf" });
    const lines2 = stream.ingest(bytes.slice(midCharCut), Date.now(), "rx", { mode: "lf" });
    assert.deepEqual(
      [...lines1, ...lines2].map((l) => l.text),
      ["第一行", "第二行"]
    );
    const flushed = stream.flush();
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0].text, "残帧片段");

    // flush 之后应可继续接收（reset 内部状态）
    const moreLines = stream.ingest(bytesOf("继续\n"), Date.now(), "rx", { mode: "lf" });
    assert.deepEqual(
      moreLines.map((l) => l.text),
      ["继续"]
    );
  }

  console.log("增量分帧检查通过");
} finally {
  await server.close();
}
