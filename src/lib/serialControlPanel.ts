export type SerialControlWidgetType = "button" | "toggle" | "slider" | "input" | "joystick" | "gauge" | "value";
export type SerialControlFormat = "text" | "hex";

interface SerialControlWidgetBase {
  id: string;
  type: SerialControlWidgetType;
  label: string;
  width: 1 | 2;
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

export type SerialControlWidget =
  | SerialButtonWidget
  | SerialToggleWidget
  | SerialSliderWidget
  | SerialInputWidget
  | SerialJoystickWidget
  | SerialGaugeWidget
  | SerialValueWidget;

export interface SerialControlPanelConfig {
  version: 1;
  name: string;
  widgets: SerialControlWidget[];
}

const STORAGE_KEY = "serial_control_panel";
const DEFAULT_PANEL: SerialControlPanelConfig = { version: 1, name: "默认控制面板", widgets: [] };
const LABELS: Record<SerialControlWidgetType, string> = {
  button: "发送按钮",
  toggle: "开关",
  slider: "滑块",
  input: "参数输入",
  joystick: "摇杆",
  gauge: "能量槽",
  value: "接收数值",
};

function widgetId() {
  return globalThis.crypto?.randomUUID?.() ?? `widget-${Date.now()}`;
}

export function createSerialControlWidget(type: SerialControlWidgetType): SerialControlWidget {
  const base = { id: widgetId(), type, label: LABELS[type], width: 1 as const, format: "text" as const };
  if (type === "button") return { ...base, type, command: "PING" };
  if (type === "toggle") return { ...base, type, onCommand: "LED=1", offCommand: "LED=0", value: false };
  if (type === "slider") {
    return { ...base, type, template: "PWM={value}", min: 0, max: 255, step: 1, value: 0, sendMode: "release" };
  }
  if (type === "input") return { ...base, type, template: "{value}", value: "" };
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
  if (type === "gauge") {
    return { ...base, type, channel: "", min: 0, max: 100, unit: "%", direction: "horizontal" };
  }
  return { ...base, type, channel: "", unit: "" };
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
  if (source.version !== 1 || !Array.isArray(source.widgets)) throw new Error("不支持的控制面板配置格式");

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
      type !== "joystick" &&
      type !== "gauge" &&
      type !== "value"
    )
      return [];

    const candidateId = stringValue(widget.id, `${type}-${index + 1}`) || `${type}-${index + 1}`;
    const id = usedIds.has(candidateId) ? `${candidateId}-${index + 1}` : candidateId;
    usedIds.add(id);
    const base = {
      id,
      type,
      label: stringValue(widget.label, LABELS[type]) || LABELS[type],
      width: widget.width === 2 ? (2 as const) : (1 as const),
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
    version: 1,
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
