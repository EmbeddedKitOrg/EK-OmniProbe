import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { streamLogLines } = await server.ssrLoadModule("/src/lib/logImport.ts");
  const log = new Blob([
    "\uFEFF[20260724_13:18:19:567]P:1,2\r\n",
    "E:calendar month 7,0x7\r",
    "[20260724_13:18:20:001]\r\n",
  ]);
  const batches = [];
  const fallbackTimestamp = new Date(2026, 0, 1).getTime();

  for await (const batch of streamLogLines(log, { batchSize: 2, fallbackTimestamp })) {
    batches.push(batch);
  }

  assert.deepEqual(
    batches.map((batch) => batch.length),
    [2, 1]
  );
  const lines = batches.flat();
  const firstTimestamp = new Date(2026, 6, 24, 13, 18, 19, 567).getTime();
  assert.deepEqual(
    lines.map(({ lineNumber, text, timestamp, timestampInferred }) => ({
      lineNumber,
      text,
      timestamp,
      timestampInferred,
    })),
    [
      { lineNumber: 1, text: "P:1,2", timestamp: firstTimestamp, timestampInferred: false },
      { lineNumber: 2, text: "E:calendar month 7,0x7", timestamp: firstTimestamp, timestampInferred: true },
      {
        lineNumber: 3,
        text: "",
        timestamp: new Date(2026, 6, 24, 13, 18, 20, 1).getTime(),
        timestampInferred: false,
      },
    ]
  );

  console.log("日志流式导入检查通过");
} finally {
  await server.close();
}
