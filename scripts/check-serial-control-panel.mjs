import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { joystickPointFromRatio, parseSerialControlPanel, renderSerialControlCommand, renderSerialJoystickCommand } =
    await server.ssrLoadModule("/src/lib/serialControlPanel.ts");
  const { parseHexBytes } = await server.ssrLoadModule("/src/lib/serialSend.ts");

  assert.equal(renderSerialControlCommand("PWM={value};COPY={value}", 128), "PWM=128;COPY=128");
  assert.equal(renderSerialJoystickCommand("X={x},Y={y}", -20, 30), "X=-20,Y=30");
  assert.deepEqual(joystickPointFromRatio({ xMin: -100, xMax: 100, yMin: -50, yMax: 50, step: 10 }, 0.76, 0.2), {
    x: 50,
    y: 30,
  });
  assert.deepEqual(parseHexBytes("48 65 6c 6C 6F"), [0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  assert.throws(() => parseHexBytes("0x12"), /十六进制/);

  const panel = parseSerialControlPanel({
    version: 1,
    name: "电机控制",
    widgets: [
      { id: "speed", type: "slider", label: "转速", min: 100, max: 10, step: 0, value: 999 },
      { id: "speed", type: "button", command: "STOP", format: "hex", width: 2 },
      { id: "stick", type: "joystick", xMin: 10, xMax: 0, yMin: -5, yMax: -10, step: 0 },
      { id: "power", type: "gauge", channel: "battery", min: 100, max: 50, direction: "vertical" },
      { id: "temp", type: "value", channel: "temperature", unit: "℃" },
      { type: "unknown" },
    ],
  });

  assert.equal(panel.widgets.length, 5);
  assert.deepEqual(
    panel.widgets.map(({ id, type }) => [id, type]),
    [
      ["speed", "slider"],
      ["speed-2", "button"],
      ["stick", "joystick"],
      ["power", "gauge"],
      ["temp", "value"],
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
  assert.deepEqual(
    {
      xMin: panel.widgets[2].xMin,
      xMax: panel.widgets[2].xMax,
      yMin: panel.widgets[2].yMin,
      yMax: panel.widgets[2].yMax,
      step: panel.widgets[2].step,
    },
    { xMin: 10, xMax: 11, yMin: -5, yMax: -4, step: 1 }
  );
  assert.equal(panel.widgets[3].max, 101);
  assert.throws(() => parseSerialControlPanel({ version: 2, widgets: [] }), /不支持/);
  assert.throws(() => parseSerialControlPanel({ version: 1, widgets: [{ type: "unknown" }] }), /没有可用/);

  console.log("串口控制面板配置检查通过");
} finally {
  await server.close();
}
