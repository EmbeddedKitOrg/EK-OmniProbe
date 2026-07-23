export type SerialControlWidgetType =
  | "button"
  | "toggle"
  | "slider"
  | "input"
  | "stepper"
  | "joystick"
  | "sequence"
  | "gauge"
  | "value"
  | "indicator"
  | "chart"
  | "xy-chart"
  | "yt-chart"
  | "imu-3d";
export type SerialControlFormat = "text" | "hex";

interface SerialControlWidgetBase {
  id: string;
  type: SerialControlWidgetType;
  label: string;
  columns: 4 | 8 | 12;
  format: SerialControlFormat;
}

export interface SerialButtonWidget extends SerialControlWidgetBase {
  type: "button";
  command: string;
}

export interface SerialToggleWidget extends SerialControlWidgetBase {
  type: "toggle";
  onCommand: string;
  offCommand: string;
  value: boolean;
}

export interface SerialSliderWidget extends SerialControlWidgetBase {
  type: "slider";
  template: string;
  min: number;
  max: number;
  step: number;
  value: number;
  sendMode: "release" | "continuous";
}

export interface SerialInputWidget extends SerialControlWidgetBase {
  type: "input";
  template: string;
  value: string;
}

export interface SerialStepperWidget extends SerialControlWidgetBase {
  type: "stepper";
  template: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface SerialJoystickWidget extends SerialControlWidgetBase {
  type: "joystick";
  template: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  step: number;
  x: number;
  y: number;
  sendMode: "release" | "continuous";
  recenter: boolean;
}

export interface SerialSequenceWidget extends SerialControlWidgetBase {
  type: "sequence";
  commands: string;
  intervalMs: number;
}

export interface SerialGaugeWidget extends SerialControlWidgetBase {
  type: "gauge";
  channel: string;
  min: number;
  max: number;
  unit: string;
  direction: "horizontal" | "vertical";
}

export interface SerialValueWidget extends SerialControlWidgetBase {
  type: "value";
  channel: string;
  unit: string;
}

export interface SerialIndicatorWidget extends SerialControlWidgetBase {
  type: "indicator";
  channel: string;
  threshold: number;
}

export interface SerialChartWidget extends SerialControlWidgetBase {
  type: "chart";
  signalDomain: "time" | "fft";
}

export interface SerialXyChartWidget extends SerialControlWidgetBase {
  type: "xy-chart";
  xChannel: string;
  yChannel: string;
  pointLimit: number;
}

export interface SerialYtChartWidget extends SerialControlWidgetBase {
  type: "yt-chart";
  channel: string;
  pointLimit: number;
}

export interface SerialImu3dWidget extends SerialControlWidgetBase {
  type: "imu-3d";
  sourceMode: "euler" | "imu6";
  rollChannel: string;
  pitchChannel: string;
  yawChannel: string;
  angleUnit: "deg" | "rad";
  accelXChannel: string;
  accelYChannel: string;
  accelZChannel: string;
  gyroXChannel: string;
  gyroYChannel: string;
  gyroZChannel: string;
  gyroUnit: "dps" | "rad";
  sampleRateHz: number;
  filterAlpha: number;
  gyroBiasX: number;
  gyroBiasY: number;
  gyroBiasZ: number;
  rollOffset: number;
  pitchOffset: number;
  yawOffset: number;
}

export type SerialControlWidget =
  | SerialButtonWidget
  | SerialToggleWidget
  | SerialSliderWidget
  | SerialInputWidget
  | SerialStepperWidget
  | SerialJoystickWidget
  | SerialSequenceWidget
  | SerialGaugeWidget
  | SerialValueWidget
  | SerialIndicatorWidget
  | SerialChartWidget
  | SerialXyChartWidget
  | SerialYtChartWidget
  | SerialImu3dWidget;

export interface SerialControlPanelConfig {
  version: 2;
  name: string;
  widgets: SerialControlWidget[];
}

const STORAGE_KEY = "serial_control_panel";
const DEFAULT_PANEL: SerialControlPanelConfig = { version: 2, name: "默认控制面板", widgets: [] };
const LABELS: Record<SerialControlWidgetType, string> = {
  button: "发送按钮",
  toggle: "开关",
  slider: "滑块",
  input: "参数输入",
  stepper: "参数微调",
  joystick: "摇杆",
  sequence: "命令序列",
  gauge: "能量槽",
  value: "接收数值",
  indicator: "状态灯",
  chart: "主图表",
  "xy-chart": "XY 二维曲线",
  "yt-chart": "YT 一维曲线",
  "imu-3d": "IMU 3D 姿态",
};

function widgetId() {
  return globalThis.crypto?.randomUUID?.() ?? `widget-${Date.now()}`;
}

export function createSerialControlWidget(type: SerialControlWidgetType): SerialControlWidget {
  const base = { id: widgetId(), type, label: LABELS[type], columns: 4 as const, format: "text" as const };
  if (type === "button") return { ...base, type, command: "PING" };
  if (type === "toggle") return { ...base, type, onCommand: "LED=1", offCommand: "LED=0", value: false };
  if (type === "slider") {
    return { ...base, type, template: "PWM={value}", min: 0, max: 255, step: 1, value: 0, sendMode: "release" };
  }
  if (type === "input") return { ...base, type, template: "{value}", value: "" };
  if (type === "stepper") {
    return { ...base, type, template: "PARAM={value}", min: 0, max: 100, step: 1, value: 0 };
  }
  if (type === "joystick") {
    return {
      ...base,
      type,
      template: "X={x},Y={y}",
      xMin: -100,
      xMax: 100,
      yMin: -100,
      yMax: 100,
      step: 1,
      x: 0,
      y: 0,
      sendMode: "continuous",
      recenter: true,
    };
  }
  if (type === "sequence") return { ...base, type, commands: "AT\nAT+GMR", intervalMs: 100 };
  if (type === "gauge") {
    return { ...base, type, channel: "", min: 0, max: 100, unit: "%", direction: "horizontal" };
  }
  if (type === "value") return { ...base, type, channel: "", unit: "" };
  if (type === "indicator") return { ...base, type, channel: "", threshold: 0.5 };
  if (type === "chart") return { ...base, type, signalDomain: "time", columns: 12 };
  if (type === "xy-chart") return { ...base, type, xChannel: "", yChannel: "", pointLimit: 200, columns: 8 };
  if (type === "yt-chart") return { ...base, type, channel: "", pointLimit: 200, columns: 8 };
  return {
    ...base,
    type,
    sourceMode: "euler",
    rollChannel: "roll",
    pitchChannel: "pitch",
    yawChannel: "yaw",
    angleUnit: "deg",
    accelXChannel: "ax",
    accelYChannel: "ay",
    accelZChannel: "az",
    gyroXChannel: "gx",
    gyroYChannel: "gy",
    gyroZChannel: "gz",
    gyroUnit: "dps",
    sampleRateHz: 100,
    filterAlpha: 0.98,
    gyroBiasX: 0,
    gyroBiasY: 0,
    gyroBiasZ: 0,
    rollOffset: 0,
    pitchOffset: 0,
    yawOffset: 0,
    columns: 8,
  };
}

function finiteNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function parseSerialControlPanel(raw: unknown): SerialControlPanelConfig {
  if (!raw || typeof raw !== "object") throw new Error("控制面板配置必须是 JSON 对象");
  const source = raw as Record<string, unknown>;
  if (source.version !== 2 || !Array.isArray(source.widgets)) throw new Error("不支持的控制面板配置格式");

  const usedIds = new Set<string>();
  const widgets = source.widgets.flatMap((rawWidget, index): SerialControlWidget[] => {
    if (!rawWidget || typeof rawWidget !== "object") return [];
    const widget = rawWidget as Record<string, unknown>;
    const type = widget.type;
    if (
      type !== "button" &&
      type !== "toggle" &&
      type !== "slider" &&
      type !== "input" &&
      type !== "stepper" &&
      type !== "joystick" &&
      type !== "sequence" &&
      type !== "gauge" &&
      type !== "value" &&
      type !== "indicator" &&
      type !== "chart" &&
      type !== "xy-chart" &&
      type !== "yt-chart" &&
      type !== "imu-3d"
    )
      return [];

    const candidateId = stringValue(widget.id, `${type}-${index + 1}`) || `${type}-${index + 1}`;
    const id = usedIds.has(candidateId) ? `${candidateId}-${index + 1}` : candidateId;
    usedIds.add(id);
    const columns: 4 | 8 | 12 = widget.columns === 8 || widget.columns === 12 ? widget.columns : 4;
    const base = {
      id,
      type,
      label: stringValue(widget.label, LABELS[type]) || LABELS[type],
      columns,
      format: widget.format === "hex" ? ("hex" as const) : ("text" as const),
    };

    if (type === "button") return [{ ...base, type, command: stringValue(widget.command, "PING") }];
    if (type === "toggle") {
      return [
        {
          ...base,
          type,
          onCommand: stringValue(widget.onCommand, "LED=1"),
          offCommand: stringValue(widget.offCommand, "LED=0"),
          value: widget.value === true,
        },
      ];
    }
    if (type === "input") {
      return [{ ...base, type, template: stringValue(widget.template, "{value}"), value: stringValue(widget.value) }];
    }

    if (type === "stepper") {
      const min = finiteNumber(widget.min, 0);
      const maxCandidate = finiteNumber(widget.max, 100);
      const max = maxCandidate > min ? maxCandidate : min + 1;
      const stepCandidate = finiteNumber(widget.step, 1);
      return [
        {
          ...base,
          type,
          template: stringValue(widget.template, "PARAM={value}"),
          min,
          max,
          step: stepCandidate > 0 ? stepCandidate : 1,
          value: Math.min(max, Math.max(min, finiteNumber(widget.value, min))),
        },
      ];
    }

    if (type === "joystick") {
      const xMin = finiteNumber(widget.xMin, -100);
      const xMaxCandidate = finiteNumber(widget.xMax, 100);
      const xMax = xMaxCandidate > xMin ? xMaxCandidate : xMin + 1;
      const yMin = finiteNumber(widget.yMin, -100);
      const yMaxCandidate = finiteNumber(widget.yMax, 100);
      const yMax = yMaxCandidate > yMin ? yMaxCandidate : yMin + 1;
      const stepCandidate = finiteNumber(widget.step, 1);
      return [
        {
          ...base,
          type,
          template: stringValue(widget.template, "X={x},Y={y}"),
          xMin,
          xMax,
          yMin,
          yMax,
          step: stepCandidate > 0 ? stepCandidate : 1,
          x: Math.min(xMax, Math.max(xMin, finiteNumber(widget.x, (xMin + xMax) / 2))),
          y: Math.min(yMax, Math.max(yMin, finiteNumber(widget.y, (yMin + yMax) / 2))),
          sendMode: widget.sendMode === "release" ? "release" : "continuous",
          recenter: widget.recenter !== false,
        },
      ];
    }

    if (type === "sequence") {
      return [
        {
          ...base,
          type,
          commands: stringValue(widget.commands, "AT\nAT+GMR"),
          intervalMs: Math.min(60_000, Math.max(0, finiteNumber(widget.intervalMs, 100))),
        },
      ];
    }

    if (type === "indicator") {
      return [
        {
          ...base,
          type,
          channel: stringValue(widget.channel),
          threshold: finiteNumber(widget.threshold, 0.5),
        },
      ];
    }

    if (type === "chart") {
      return [{ ...base, type, signalDomain: widget.signalDomain === "fft" ? "fft" : "time" }];
    }

    if (type === "xy-chart") {
      return [
        {
          ...base,
          type,
          xChannel: stringValue(widget.xChannel),
          yChannel: stringValue(widget.yChannel),
          pointLimit: Math.min(2_000, Math.max(10, Math.round(finiteNumber(widget.pointLimit, 200)))),
        },
      ];
    }

    if (type === "yt-chart") {
      return [
        {
          ...base,
          type,
          channel: stringValue(widget.channel),
          pointLimit: Math.min(2_000, Math.max(10, Math.round(finiteNumber(widget.pointLimit, 200)))),
        },
      ];
    }

    if (type === "imu-3d") {
      return [
        {
          ...base,
          type,
          sourceMode: widget.sourceMode === "imu6" ? "imu6" : "euler",
          rollChannel: stringValue(widget.rollChannel, "roll"),
          pitchChannel: stringValue(widget.pitchChannel, "pitch"),
          yawChannel: stringValue(widget.yawChannel, "yaw"),
          angleUnit: widget.angleUnit === "rad" ? "rad" : "deg",
          accelXChannel: stringValue(widget.accelXChannel, "ax"),
          accelYChannel: stringValue(widget.accelYChannel, "ay"),
          accelZChannel: stringValue(widget.accelZChannel, "az"),
          gyroXChannel: stringValue(widget.gyroXChannel, "gx"),
          gyroYChannel: stringValue(widget.gyroYChannel, "gy"),
          gyroZChannel: stringValue(widget.gyroZChannel, "gz"),
          gyroUnit: widget.gyroUnit === "rad" ? "rad" : "dps",
          sampleRateHz: Math.min(10_000, Math.max(1, finiteNumber(widget.sampleRateHz, 100))),
          filterAlpha: Math.min(1, Math.max(0, finiteNumber(widget.filterAlpha, 0.98))),
          gyroBiasX: finiteNumber(widget.gyroBiasX, 0),
          gyroBiasY: finiteNumber(widget.gyroBiasY, 0),
          gyroBiasZ: finiteNumber(widget.gyroBiasZ, 0),
          rollOffset: finiteNumber(widget.rollOffset, 0),
          pitchOffset: finiteNumber(widget.pitchOffset, 0),
          yawOffset: finiteNumber(widget.yawOffset, 0),
        },
      ];
    }

    if (type === "value") {
      return [{ ...base, type, channel: stringValue(widget.channel), unit: stringValue(widget.unit) }];
    }

    if (type === "gauge") {
      const min = finiteNumber(widget.min, 0);
      const maxCandidate = finiteNumber(widget.max, 100);
      return [
        {
          ...base,
          type,
          channel: stringValue(widget.channel),
          min,
          max: maxCandidate > min ? maxCandidate : min + 1,
          unit: stringValue(widget.unit, "%"),
          direction: widget.direction === "vertical" ? "vertical" : "horizontal",
        },
      ];
    }

    const min = finiteNumber(widget.min, 0);
    const maxCandidate = finiteNumber(widget.max, 255);
    const max = maxCandidate > min ? maxCandidate : min + 1;
    const stepCandidate = finiteNumber(widget.step, 1);
    const step = stepCandidate > 0 ? stepCandidate : 1;
    const value = Math.min(max, Math.max(min, finiteNumber(widget.value, min)));
    return [
      {
        ...base,
        type,
        template: stringValue(widget.template, "PWM={value}"),
        min,
        max,
        step,
        value,
        sendMode: widget.sendMode === "continuous" ? "continuous" : "release",
      },
    ];
  });

  if (source.widgets.length > 0 && widgets.length === 0) throw new Error("配置中没有可用的控制面板控件");

  return {
    version: 2,
    name: stringValue(source.name, DEFAULT_PANEL.name) || DEFAULT_PANEL.name,
    widgets,
  };
}

export function loadSerialControlPanel(): SerialControlPanelConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseSerialControlPanel(JSON.parse(saved)) : { ...DEFAULT_PANEL };
  } catch {
    return { ...DEFAULT_PANEL };
  }
}

export function saveSerialControlPanel(panel: SerialControlPanelConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panel));
  } catch {
    // 本地存储不可用时仍允许当前会话继续使用。
  }
}

export function renderSerialControlCommand(template: string, value: string | number) {
  return template.split("{value}").join(String(value));
}

export function renderSerialJoystickCommand(template: string, x: number, y: number) {
  return template.split("{x}").join(String(x)).split("{y}").join(String(y));
}

export function parseSerialCommandSequence(commands: string) {
  return commands.split(/\r\n?|\n/).filter((command) => command.trim().length > 0);
}

export function moveSerialControlWidget(widgets: SerialControlWidget[], sourceId: string, targetId: string) {
  const sourceIndex = widgets.findIndex((widget) => widget.id === sourceId);
  const targetIndex = widgets.findIndex((widget) => widget.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return widgets;
  const next = [...widgets];
  const [widget] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, widget);
  return next;
}

function normalizeAngle(angle: number) {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

export function applySerialImuOffsets(
  raw: { roll: number; pitch: number; yaw: number },
  offsets: Pick<SerialImu3dWidget, "rollOffset" | "pitchOffset" | "yawOffset">
) {
  return {
    roll: normalizeAngle(raw.roll - offsets.rollOffset),
    pitch: normalizeAngle(raw.pitch - offsets.pitchOffset),
    yaw: normalizeAngle(raw.yaw - offsets.yawOffset),
  };
}

export function resolveSerialImuAngles(
  widget: Pick<
    SerialImu3dWidget,
    "rollChannel" | "pitchChannel" | "yawChannel" | "angleUnit" | "rollOffset" | "pitchOffset" | "yawOffset"
  >,
  values: Record<string, number>
) {
  const source = [values[widget.rollChannel], values[widget.pitchChannel], values[widget.yawChannel]];
  if (!source.every(Number.isFinite)) return null;
  const factor = widget.angleUnit === "rad" ? 180 / Math.PI : 1;
  const raw = { roll: source[0] * factor, pitch: source[1] * factor, yaw: source[2] * factor };
  return { raw, display: applySerialImuOffsets(raw, widget) };
}

function quantize(value: number, min: number, max: number, step: number) {
  const quantized = min + Math.round((value - min) / step) * step;
  return Number(Math.min(max, Math.max(min, quantized)).toFixed(10));
}

export function joystickPointFromRatio(
  widget: Pick<SerialJoystickWidget, "xMin" | "xMax" | "yMin" | "yMax" | "step">,
  xRatio: number,
  yRatio: number
) {
  const x = widget.xMin + Math.min(1, Math.max(0, xRatio)) * (widget.xMax - widget.xMin);
  const y = widget.yMax - Math.min(1, Math.max(0, yRatio)) * (widget.yMax - widget.yMin);
  return {
    x: quantize(x, widget.xMin, widget.xMax, widget.step),
    y: quantize(y, widget.yMin, widget.yMax, widget.step),
  };
}
