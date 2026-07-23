import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { parseSerialControlPanel, renderSerialControlCommand } = await server.ssrLoadModule(
    "/src/lib/serialControlPanel.ts"
  );
  const { parseHexBytes } = await server.ssrLoadModule("/src/lib/serialSend.ts");

  assert.equal(renderSerialControlCommand("PWM={value};COPY={value}", 128), "PWM=128;COPY=128");
  assert.deepEqual(parseHexBytes("48 65 6c 6C 6F"), [0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  assert.throws(() => parseHexBytes("0x12"), /十六进制/);

  const panel = parseSerialControlPanel({
    version: 1,
    name: "电机控制",
    widgets: [
      { id: "speed", type: "slider", label: "转速", min: 100, max: 10, step: 0, value: 999 },
      { id: "speed", type: "button", command: "STOP", format: "hex", width: 2 },
      { type: "unknown" },
    ],
  });

  assert.equal(panel.widgets.length, 2);
  assert.deepEqual(
    panel.widgets.map(({ id, type }) => [id, type]),
    [
      ["speed", "slider"],
      ["speed-2", "button"],
    ]
  );
  assert.deepEqual(
    {
      min: panel.widgets[0].min,
      max: panel.widgets[0].max,
      step: panel.widgets[0].step,
      value: panel.widgets[0].value,
    },
    { min: 100, max: 101, step: 1, value: 101 }
  );
  assert.throws(() => parseSerialControlPanel({ version: 2, widgets: [] }), /不支持/);
  assert.throws(() => parseSerialControlPanel({ version: 1, widgets: [{ type: "unknown" }] }), /没有可用/);

  console.log("串口控制面板配置检查通过");
} finally {
  await server.close();
}
