import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  GripVertical,
  LayoutDashboard,
  Minus,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useLogStore } from "@/stores/logStore";
import { useSerialStore } from "@/stores/serialStore";
import { useShallow } from "zustand/react/shallow";
import { sendSerialPayload } from "@/lib/serialSend";
import {
  createSerialControlWidget,
  loadSerialControlPanel,
  joystickPointFromRatio,
  parseSerialCommandSequence,
  parseSerialControlPanel,
  renderSerialControlCommand,
  renderSerialJoystickCommand,
  saveSerialControlPanel,
  type SerialControlPanelConfig,
  type SerialControlWidget,
  type SerialControlWidgetType,
  type SerialJoystickWidget,
} from "@/lib/serialControlPanel";
import { cn } from "@/lib/utils";
import { exportJson } from "@/lib/exporters";
import { SerialControlMiniChart } from "./SerialControlMiniChart";

type RuntimeValue = string | number | boolean | { x: number; y: number };
const EMPTY_CHART_VALUES: Record<string, number> = {};

function initialRuntimeValues(panel: SerialControlPanelConfig) {
  return Object.fromEntries(
    panel.widgets.flatMap((widget) =>
      widget.type === "joystick"
        ? [[widget.id, { x: widget.x, y: widget.y }]]
        : "value" in widget
          ? [[widget.id, widget.value]]
          : []
    )
  ) as Record<string, RuntimeValue>;
}

export function SerialControlPanel() {
  const { connected, sendSettings, chartData, latestValues, chartChannels } = useSerialStore(
    useShallow((state) => ({
      connected: state.connected,
      sendSettings: state.sendSettings,
      chartData: state.chartData,
      latestValues: state.chartData[state.chartData.length - 1]?.values ?? EMPTY_CHART_VALUES,
      chartChannels: state.chartConfig.channels,
    }))
  );
  const addLog = useLogStore((state) => state.addLog);
  const [panel, setPanel] = useState(loadSerialControlPanel);
  const [editing, setEditing] = useState(panel.widgets.length === 0);
  const [runtimeValues, setRuntimeValues] = useState(() => initialRuntimeValues(panel));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [status, setStatus] = useState("等待操作");
  const [runningSequenceId, setRunningSequenceId] = useState<string | null>(null);
  const lastContinuousSendRef = useRef<Record<string, number>>({});
  const runningSequenceRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const availableChannels = Array.from(
    new Set([...chartChannels.map((channel) => channel.key), ...Object.keys(latestValues)])
  );

  useEffect(() => saveSerialControlPanel(panel), [panel]);

  const updateWidget = (id: string, updater: (widget: SerialControlWidget) => SerialControlWidget) => {
    setPanel((current) => ({
      ...current,
      widgets: current.widgets.map((widget) => (widget.id === id ? updater(widget) : widget)),
    }));
  };

  const addWidget = (type: SerialControlWidgetType) => {
    const widget = createSerialControlWidget(type);
    setPanel((current) => ({ ...current, widgets: [...current.widgets, widget] }));
    if ("value" in widget) setRuntimeValues((current) => ({ ...current, [widget.id]: widget.value }));
  };

  const removeWidget = (id: string) => {
    setPanel((current) => ({ ...current, widgets: current.widgets.filter((widget) => widget.id !== id) }));
  };

  const moveWidget = (id: string, offset: number) => {
    setPanel((current) => {
      const index = current.widgets.findIndex((widget) => widget.id === id);
      const nextIndex = Math.min(current.widgets.length - 1, Math.max(0, index + offset));
      if (index < 0 || nextIndex === index) return current;
      const widgets = [...current.widgets];
      const [widget] = widgets.splice(index, 1);
      widgets.splice(nextIndex, 0, widget);
      return { ...current, widgets };
    });
  };

  const dropWidget = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setPanel((current) => {
      const sourceIndex = current.widgets.findIndex((widget) => widget.id === draggedId);
      const targetIndex = current.widgets.findIndex((widget) => widget.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const widgets = [...current.widgets];
      const [widget] = widgets.splice(sourceIndex, 1);
      widgets.splice(targetIndex, 0, widget);
      return { ...current, widgets };
    });
    setDraggedId(null);
  };

  const sendCommand = async (widget: SerialControlWidget, command: string) => {
    if (!command.trim()) {
      addLog("warn", `${widget.label} 的发送内容为空`);
      return false;
    }
    try {
      await sendSerialPayload(command, { hexMode: widget.format === "hex" });
      setStatus(`${widget.label} 已发送`);
      return true;
    } catch (error) {
      addLog("error", `${widget.label} 发送失败: ${error}`);
      setStatus(`${widget.label} 发送失败`);
      return false;
    }
  };

  const sendSliderValue = (widget: Extract<SerialControlWidget, { type: "slider" }>, value: number) =>
    sendCommand(widget, renderSerialControlCommand(widget.template, value));

  const sendJoystickPoint = (widget: SerialJoystickWidget, point: { x: number; y: number }) =>
    sendCommand(widget, renderSerialJoystickCommand(widget.template, point.x, point.y));

  const commitStepperValue = (widget: Extract<SerialControlWidget, { type: "stepper" }>, rawValue: number) => {
    const value = Number(
      Math.min(widget.max, Math.max(widget.min, Number.isFinite(rawValue) ? rawValue : widget.value)).toFixed(10)
    );
    setRuntimeValues((current) => ({ ...current, [widget.id]: value }));
    updateWidget(widget.id, (current) => (current.type === "stepper" ? { ...current, value } : current));
    void sendCommand(widget, renderSerialControlCommand(widget.template, value));
  };

  const runSequence = async (widget: Extract<SerialControlWidget, { type: "sequence" }>) => {
    if (runningSequenceRef.current) return;
    const commands = parseSerialCommandSequence(widget.commands);
    if (commands.length === 0) {
      addLog("warn", `${widget.label} 没有可发送的命令`);
      return;
    }
    runningSequenceRef.current = widget.id;
    setRunningSequenceId(widget.id);
    try {
      for (let index = 0; index < commands.length; index += 1) {
        setStatus(`${widget.label} ${index + 1}/${commands.length}`);
        if (!(await sendCommand(widget, commands[index]))) return;
        if (index < commands.length - 1 && widget.intervalMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, widget.intervalMs));
        }
      }
      setStatus(`${widget.label} 已完成`);
    } finally {
      runningSequenceRef.current = null;
      setRunningSequenceId(null);
    }
  };

  const commitSliderValue = (widget: Extract<SerialControlWidget, { type: "slider" }>, value: number) => {
    updateWidget(widget.id, (current) => (current.type === "slider" ? { ...current, value } : current));
    void sendSliderValue(widget, value);
  };

  const joystickPointFromEvent = (widget: SerialJoystickWidget, event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return joystickPointFromRatio(
      widget,
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height
    );
  };

  const moveJoystick = (widget: SerialJoystickWidget, point: { x: number; y: number }) => {
    setRuntimeValues((current) => ({ ...current, [widget.id]: point }));
    if (widget.sendMode !== "continuous") return;
    const now = Date.now();
    if (now - (lastContinuousSendRef.current[widget.id] ?? 0) < 100) return;
    lastContinuousSendRef.current[widget.id] = now;
    void sendJoystickPoint(widget, point);
  };

  const finishJoystick = async (widget: SerialJoystickWidget, point: { x: number; y: number }) => {
    await sendJoystickPoint(widget, point);
    const next = widget.recenter ? joystickPointFromRatio(widget, 0.5, 0.5) : point;
    setRuntimeValues((current) => ({ ...current, [widget.id]: next }));
    updateWidget(widget.id, (current) =>
      current.type === "joystick" ? { ...current, x: next.x, y: next.y } : current
    );
    if (widget.recenter) await sendJoystickPoint(widget, next);
  };

  const exportPanel = async () => {
    try {
      const fileName = `${panel.name.replace(/[\\/:*?"<>|]+/g, "-") || "serial-control-panel"}.json`;
      const path = await exportJson(JSON.stringify(parseSerialControlPanel(panel), null, 2), fileName);
      if (path) setStatus(`已导出到 ${path}`);
    } catch (error) {
      addLog("error", `控制面板导出失败: ${error}`);
    }
  };

  const importPanel = async (file: File) => {
    try {
      const nextPanel = parseSerialControlPanel(JSON.parse(await file.text()));
      setPanel(nextPanel);
      setRuntimeValues(initialRuntimeValues(nextPanel));
      setEditing(true);
      setStatus(`已导入 ${nextPanel.name}`);
    } catch (error) {
      addLog("error", `控制面板导入失败: ${error}`);
    }
  };

  const toggleEditing = () => {
    if (!editing) {
      setEditing(true);
      return;
    }
    const normalized = parseSerialControlPanel(panel);
    setPanel(normalized);
    setRuntimeValues(initialRuntimeValues(normalized));
    setEditing(false);
  };

  const renderEditor = (widget: SerialControlWidget) => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${widget.id}-label`}>名称</Label>
          <Input
            id={`${widget.id}-label`}
            value={widget.label}
            onChange={(event) => updateWidget(widget.id, (current) => ({ ...current, label: event.target.value }))}
          />
        </div>
        {widget.type !== "gauge" &&
          widget.type !== "value" &&
          widget.type !== "indicator" &&
          widget.type !== "xy-chart" &&
          widget.type !== "yt-chart" && (
            <div className="space-y-1.5">
              <Label>发送格式</Label>
              <Select
                value={widget.format}
                onValueChange={(format: "text" | "hex") =>
                  updateWidget(widget.id, (current) => ({ ...current, format }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">文本</SelectItem>
                  <SelectItem value="hex">HEX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
      </div>

      {widget.type === "button" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${widget.id}-command`}>点击时发送</Label>
          <Input
            id={`${widget.id}-command`}
            value={widget.command}
            onChange={(event) =>
              updateWidget(widget.id, (current) =>
                current.type === "button" ? { ...current, command: event.target.value } : current
              )
            }
            className="font-mono"
          />
        </div>
      )}

      {widget.type === "sequence" && (
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <div className="space-y-1.5">
            <Label htmlFor={`${widget.id}-commands`}>命令列表</Label>
            <textarea
              id={`${widget.id}-commands`}
              value={widget.commands}
              rows={5}
              onChange={(event) =>
                updateWidget(widget.id, (current) =>
                  current.type === "sequence" ? { ...current, commands: event.target.value } : current
                )
              }
              className="w-full resize-y rounded-[14px] border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              placeholder={"AT\nAT+GMR"}
            />
            <p className="text-[11px] text-muted-foreground">每行一条命令，空行自动忽略。</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${widget.id}-interval`}>命令间隔 (ms)</Label>
            <Input
              id={`${widget.id}-interval`}
              type="number"
              min={0}
              max={60000}
              value={widget.intervalMs}
              onChange={(event) =>
                updateWidget(widget.id, (current) =>
                  current.type === "sequence" ? { ...current, intervalMs: Number(event.target.value) } : current
                )
              }
            />
          </div>
        </div>
      )}

      {widget.type === "toggle" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${widget.id}-on`}>开启时发送</Label>
            <Input
              id={`${widget.id}-on`}
              value={widget.onCommand}
              onChange={(event) =>
                updateWidget(widget.id, (current) =>
                  current.type === "toggle" ? { ...current, onCommand: event.target.value } : current
                )
              }
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${widget.id}-off`}>关闭时发送</Label>
            <Input
              id={`${widget.id}-off`}
              value={widget.offCommand}
              onChange={(event) =>
                updateWidget(widget.id, (current) =>
                  current.type === "toggle" ? { ...current, offCommand: event.target.value } : current
                )
              }
              className="font-mono"
            />
          </div>
        </div>
      )}

      {(widget.type === "slider" ||
        widget.type === "input" ||
        widget.type === "stepper" ||
        widget.type === "joystick") && (
        <div className="space-y-1.5">
          <Label htmlFor={`${widget.id}-template`}>发送模板</Label>
          <Input
            id={`${widget.id}-template`}
            value={widget.template}
            onChange={(event) =>
              updateWidget(widget.id, (current) =>
                current.type === "slider" ||
                current.type === "input" ||
                current.type === "stepper" ||
                current.type === "joystick"
                  ? { ...current, template: event.target.value }
                  : current
              )
            }
            placeholder={
              widget.type === "joystick" ? "X={x},Y={y}" : widget.type === "stepper" ? "PARAM={value}" : "PWM={value}"
            }
            className="font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            {widget.type === "joystick" ? (
              <>
                使用 {"{x}"} 和 {"{y}"} 表示摇杆坐标。
              </>
            ) : (
              <>使用 {"{value}"} 表示当前控件值。</>
            )}
          </p>
        </div>
      )}

      {(widget.type === "slider" || widget.type === "stepper") && (
        <div className="grid gap-3 sm:grid-cols-4">
          {(["min", "max", "step"] as const).map((key) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`${widget.id}-${key}`}>
                {key === "min" ? "最小值" : key === "max" ? "最大值" : "步长"}
              </Label>
              <Input
                id={`${widget.id}-${key}`}
                type="number"
                value={widget[key]}
                onChange={(event) =>
                  updateWidget(widget.id, (current) =>
                    current.type === "slider" || current.type === "stepper"
                      ? { ...current, [key]: Number(event.target.value) }
                      : current
                  )
                }
              />
            </div>
          ))}
          {widget.type === "slider" && (
            <div className="space-y-1.5">
              <Label>发送方式</Label>
              <Select
                value={widget.sendMode}
                onValueChange={(sendMode: "release" | "continuous") =>
                  updateWidget(widget.id, (current) => (current.type === "slider" ? { ...current, sendMode } : current))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="release">松手发送</SelectItem>
                  <SelectItem value="continuous">连续发送</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {widget.type === "joystick" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-5">
            {(["xMin", "xMax", "yMin", "yMax", "step"] as const).map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`${widget.id}-${key}`}>
                  {key === "xMin"
                    ? "X 最小值"
                    : key === "xMax"
                      ? "X 最大值"
                      : key === "yMin"
                        ? "Y 最小值"
                        : key === "yMax"
                          ? "Y 最大值"
                          : "步长"}
                </Label>
                <Input
                  id={`${widget.id}-${key}`}
                  type="number"
                  value={widget[key]}
                  onChange={(event) =>
                    updateWidget(widget.id, (current) =>
                      current.type === "joystick" ? { ...current, [key]: Number(event.target.value) } : current
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>发送方式</Label>
              <Select
                value={widget.sendMode}
                onValueChange={(sendMode: "release" | "continuous") =>
                  updateWidget(widget.id, (current) =>
                    current.type === "joystick" ? { ...current, sendMode } : current
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="release">松手发送</SelectItem>
                  <SelectItem value="continuous">连续发送</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-between rounded-lg border border-border/60 px-3 py-2">
              <div>
                <Label htmlFor={`${widget.id}-recenter`}>松手回中</Label>
                <p className="text-[11px] text-muted-foreground">松手后发送中心坐标。</p>
              </div>
              <Switch
                id={`${widget.id}-recenter`}
                checked={widget.recenter}
                onCheckedChange={(recenter) =>
                  updateWidget(widget.id, (current) =>
                    current.type === "joystick" ? { ...current, recenter } : current
                  )
                }
              />
            </div>
          </div>
        </div>
      )}

      {(widget.type === "gauge" ||
        widget.type === "value" ||
        widget.type === "indicator" ||
        widget.type === "yt-chart") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${widget.id}-channel`}>接收通道 key</Label>
            <Input
              id={`${widget.id}-channel`}
              list="serial-control-channels"
              value={widget.channel}
              onChange={(event) =>
                updateWidget(widget.id, (current) =>
                  current.type === "gauge" ||
                  current.type === "value" ||
                  current.type === "indicator" ||
                  current.type === "yt-chart"
                    ? { ...current, channel: event.target.value }
                    : current
                )
              }
              placeholder="例如 temp"
            />
          </div>
          {(widget.type === "gauge" || widget.type === "value") && (
            <div className="space-y-1.5">
              <Label htmlFor={`${widget.id}-unit`}>单位</Label>
              <Input
                id={`${widget.id}-unit`}
                value={widget.unit}
                onChange={(event) =>
                  updateWidget(widget.id, (current) =>
                    current.type === "gauge" || current.type === "value"
                      ? { ...current, unit: event.target.value }
                      : current
                  )
                }
                placeholder="例如 ℃"
              />
            </div>
          )}
        </div>
      )}

      {widget.type === "indicator" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${widget.id}-threshold`}>触发阈值（大于等于时点亮）</Label>
          <Input
            id={`${widget.id}-threshold`}
            type="number"
            value={widget.threshold}
            onChange={(event) =>
              updateWidget(widget.id, (current) =>
                current.type === "indicator" ? { ...current, threshold: Number(event.target.value) } : current
              )
            }
          />
        </div>
      )}

      {widget.type === "xy-chart" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["xChannel", "yChannel"] as const).map((key) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`${widget.id}-${key}`}>{key === "xChannel" ? "X 通道 key" : "Y 通道 key"}</Label>
              <Input
                id={`${widget.id}-${key}`}
                list="serial-control-channels"
                value={widget[key]}
                onChange={(event) =>
                  updateWidget(widget.id, (current) =>
                    current.type === "xy-chart" ? { ...current, [key]: event.target.value } : current
                  )
                }
              />
            </div>
          ))}
        </div>
      )}

      {(widget.type === "xy-chart" || widget.type === "yt-chart") && (
        <div className="space-y-1.5">
          <Label htmlFor={`${widget.id}-point-limit`}>显示点数</Label>
          <Input
            id={`${widget.id}-point-limit`}
            type="number"
            min={10}
            max={2000}
            value={widget.pointLimit}
            onChange={(event) =>
              updateWidget(widget.id, (current) =>
                current.type === "xy-chart" || current.type === "yt-chart"
                  ? { ...current, pointLimit: Number(event.target.value) }
                  : current
              )
            }
          />
          <p className="text-[11px] text-muted-foreground">使用波形解析缓存中的最近 10–2000 个点。</p>
        </div>
      )}

      {widget.type === "gauge" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {(["min", "max"] as const).map((key) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`${widget.id}-${key}`}>{key === "min" ? "最小值" : "最大值"}</Label>
              <Input
                id={`${widget.id}-${key}`}
                type="number"
                value={widget[key]}
                onChange={(event) =>
                  updateWidget(widget.id, (current) =>
                    current.type === "gauge" ? { ...current, [key]: Number(event.target.value) } : current
                  )
                }
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>方向</Label>
            <Select
              value={widget.direction}
              onValueChange={(direction: "horizontal" | "vertical") =>
                updateWidget(widget.id, (current) => (current.type === "gauge" ? { ...current, direction } : current))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="horizontal">横向</SelectItem>
                <SelectItem value="vertical">纵向</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );

  const renderControl = (widget: SerialControlWidget) => {
    if (widget.type === "button") {
      return (
        <Button className="h-12 w-full" disabled={!connected} onClick={() => void sendCommand(widget, widget.command)}>
          <Send className="mr-2 h-4 w-4" />
          {widget.label}
        </Button>
      );
    }

    if (widget.type === "sequence") {
      const commands = parseSerialCommandSequence(widget.commands);
      const running = runningSequenceId === widget.id;
      return (
        <div className="space-y-2">
          <Button
            className="h-12 w-full"
            disabled={!connected || runningSequenceId !== null || commands.length === 0}
            onClick={() => void runSequence(widget)}
          >
            <Send className="mr-2 h-4 w-4" />
            {running ? "正在执行…" : widget.label}
          </Button>
          <div className="text-center text-[11px] text-muted-foreground">
            {commands.length} 条命令 · 间隔 {widget.intervalMs}ms
          </div>
        </div>
      );
    }

    if (widget.type === "toggle") {
      const checked = Boolean(runtimeValues[widget.id] ?? widget.value);
      return (
        <div className="flex items-center justify-between gap-4 py-2">
          <div>
            <div className="font-medium text-foreground">{widget.label}</div>
            <div className="text-xs text-muted-foreground">{checked ? "已开启" : "已关闭"}</div>
          </div>
          <Switch
            checked={checked}
            disabled={!connected}
            onCheckedChange={async (next) => {
              setRuntimeValues((current) => ({ ...current, [widget.id]: next }));
              const sent = await sendCommand(widget, next ? widget.onCommand : widget.offCommand);
              if (sent) {
                updateWidget(widget.id, (current) =>
                  current.type === "toggle" ? { ...current, value: next } : current
                );
              } else {
                setRuntimeValues((current) => ({ ...current, [widget.id]: checked }));
              }
            }}
          />
        </div>
      );
    }

    if (widget.type === "slider") {
      const value = Number(runtimeValues[widget.id] ?? widget.value);
      const handleChange = (next: number) => {
        setRuntimeValues((current) => ({ ...current, [widget.id]: next }));
        if (widget.sendMode !== "continuous") return;
        const now = Date.now();
        if (now - (lastContinuousSendRef.current[widget.id] ?? 0) < 100) return;
        lastContinuousSendRef.current[widget.id] = now;
        void sendSliderValue(widget, next);
      };
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">{widget.label}</span>
            <span className="rounded-full bg-secondary px-3 py-1 font-mono text-sm">{value}</span>
          </div>
          <input
            type="range"
            min={widget.min}
            max={widget.max}
            step={widget.step}
            value={value}
            disabled={!connected}
            onChange={(event) => handleChange(Number(event.target.value))}
            onPointerUp={(event) => commitSliderValue(widget, Number(event.currentTarget.value))}
            onKeyUp={(event) => commitSliderValue(widget, Number(event.currentTarget.value))}
            className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{widget.min}</span>
            <span>{widget.sendMode === "continuous" ? "连续发送 · 100ms 节流" : "松手发送"}</span>
            <span>{widget.max}</span>
          </div>
        </div>
      );
    }

    if (widget.type === "stepper") {
      const rawValue = runtimeValues[widget.id] ?? widget.value;
      const numericValue = Number(rawValue);
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">{widget.label}</span>
            <span className="text-[11px] text-muted-foreground">
              步长 {widget.step} · {widget.min}～{widget.max}
            </span>
          </div>
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2">
            <Button
              size="icon"
              variant="outline"
              disabled={!connected}
              onClick={() => commitStepperValue(widget, numericValue - widget.step)}
              aria-label={`${widget.label}减小`}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              min={widget.min}
              max={widget.max}
              step={widget.step}
              value={rawValue as string | number}
              disabled={!connected}
              onChange={(event) => setRuntimeValues((current) => ({ ...current, [widget.id]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitStepperValue(widget, Number(event.currentTarget.value));
              }}
              className="text-center font-mono"
              aria-label={`${widget.label}数值`}
            />
            <Button
              size="icon"
              variant="outline"
              disabled={!connected}
              onClick={() => commitStepperValue(widget, numericValue + widget.step)}
              aria-label={`${widget.label}增大`}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              disabled={!connected}
              onClick={() => commitStepperValue(widget, numericValue)}
              title="发送当前值"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    if (widget.type === "joystick") {
      const runtime = runtimeValues[widget.id];
      const point = typeof runtime === "object" ? runtime : { x: widget.x, y: widget.y };
      const left = ((point.x - widget.xMin) / (widget.xMax - widget.xMin)) * 100;
      const top = ((widget.yMax - point.y) / (widget.yMax - widget.yMin)) * 100;
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">{widget.label}</span>
            <span className="rounded-full bg-secondary px-3 py-1 font-mono text-sm">
              X {point.x} · Y {point.y}
            </span>
          </div>
          <div
            role="application"
            tabIndex={connected ? 0 : -1}
            aria-label={`${widget.label}摇杆，X ${point.x}，Y ${point.y}`}
            className={cn(
              "relative mx-auto aspect-square w-full max-w-48 touch-none overflow-hidden rounded-full border border-border bg-muted/60",
              !connected && "cursor-not-allowed opacity-50"
            )}
            onPointerDown={(event) => {
              if (!connected) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              moveJoystick(widget, joystickPointFromEvent(widget, event));
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                moveJoystick(widget, joystickPointFromEvent(widget, event));
              }
            }}
            onPointerUp={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const next = joystickPointFromEvent(widget, event);
              event.currentTarget.releasePointerCapture(event.pointerId);
              void finishJoystick(widget, next);
            }}
            onKeyDown={(event) => {
              const offset =
                event.key === "ArrowLeft"
                  ? [-widget.step, 0]
                  : event.key === "ArrowRight"
                    ? [widget.step, 0]
                    : event.key === "ArrowUp"
                      ? [0, widget.step]
                      : event.key === "ArrowDown"
                        ? [0, -widget.step]
                        : null;
              if (!offset) return;
              event.preventDefault();
              const next = joystickPointFromRatio(
                widget,
                (point.x + offset[0] - widget.xMin) / (widget.xMax - widget.xMin),
                (widget.yMax - point.y - offset[1]) / (widget.yMax - widget.yMin)
              );
              setRuntimeValues((current) => ({ ...current, [widget.id]: next }));
              updateWidget(widget.id, (current) =>
                current.type === "joystick" ? { ...current, x: next.x, y: next.y } : current
              );
              void sendJoystickPoint(widget, next);
            }}
          >
            <div className="absolute left-1/2 top-0 h-full w-px bg-border/80" />
            <div className="absolute left-0 top-1/2 h-px w-full bg-border/80" />
            <div
              className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/20 shadow-md"
              style={{ left: `${left}%`, top: `${top}%` }}
            />
          </div>
          <div className="text-center text-[11px] text-muted-foreground">
            {widget.sendMode === "continuous" ? "连续发送 · 100ms 节流" : "松手发送"}
            {widget.recenter ? " · 松手回中" : ""}
          </div>
        </div>
      );
    }

    if (widget.type === "gauge") {
      const value = latestValues[widget.channel];
      const percent = Number.isFinite(value)
        ? Math.min(100, Math.max(0, ((value - widget.min) / (widget.max - widget.min)) * 100))
        : 0;
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">{widget.label}</span>
            <span className="font-mono text-lg font-semibold">
              {Number.isFinite(value) ? value : "--"}
              {widget.unit}
            </span>
          </div>
          {widget.direction === "vertical" ? (
            <div className="mx-auto flex h-40 w-16 items-end overflow-hidden rounded-xl border border-border bg-muted/60">
              <div className="w-full bg-primary transition-[height]" style={{ height: `${percent}%` }} />
            </div>
          ) : (
            <div className="h-5 overflow-hidden rounded-full border border-border bg-muted/60">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          )}
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{widget.min}</span>
            <span>{widget.channel ? `通道 ${widget.channel}` : "未绑定通道"}</span>
            <span>{widget.max}</span>
          </div>
        </div>
      );
    }

    if (widget.type === "value") {
      const value = latestValues[widget.channel];
      return (
        <div className="flex min-h-24 flex-col items-center justify-center text-center">
          <div className="text-sm text-muted-foreground">{widget.label}</div>
          <div className="mt-2 font-mono text-4xl font-semibold tracking-tight text-foreground">
            {Number.isFinite(value) ? value : "--"}
            <span className="ml-1 text-base font-normal text-muted-foreground">{widget.unit}</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {widget.channel ? `通道 ${widget.channel}` : "未绑定通道"}
          </div>
        </div>
      );
    }

    if (widget.type === "indicator") {
      const value = latestValues[widget.channel];
      const available = Number.isFinite(value);
      const active = available && value >= widget.threshold;
      return (
        <div className="flex min-h-24 items-center justify-between gap-4">
          <div>
            <div className="font-medium text-foreground">{widget.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {available ? `${widget.channel} = ${value}` : widget.channel ? "等待通道数据" : "未绑定通道"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-sm font-medium", active ? "text-green-600" : "text-muted-foreground")}>
              {available ? (active ? "已触发" : "未触发") : "--"}
            </span>
            <span
              className={cn(
                "h-8 w-8 rounded-full border-4 border-white shadow-[0_0_0_1px_hsl(var(--border))] transition-colors",
                active ? "bg-green-500 shadow-[0_0_18px_rgba(34,197,94,0.7)]" : "bg-muted"
              )}
              aria-label={active ? "状态灯已点亮" : "状态灯未点亮"}
            />
          </div>
        </div>
      );
    }

    if (widget.type === "xy-chart" || widget.type === "yt-chart") {
      const yChannel = widget.type === "xy-chart" ? widget.yChannel : widget.channel;
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">{widget.label}</span>
            <span className="text-[11px] text-muted-foreground">
              {widget.type === "xy-chart"
                ? `${widget.xChannel || "X"} / ${widget.yChannel || "Y"}`
                : `${widget.channel || "Y"} / 时间`}
              · 最近 {widget.pointLimit} 点
            </span>
          </div>
          <SerialControlMiniChart
            mode={widget.type === "xy-chart" ? "xy" : "yt"}
            chartData={chartData}
            xChannel={widget.type === "xy-chart" ? widget.xChannel : undefined}
            yChannel={yChannel}
            pointLimit={widget.pointLimit}
          />
        </div>
      );
    }

    const value = String(runtimeValues[widget.id] ?? widget.value);
    const sendInput = async () => {
      const sent = await sendCommand(widget, renderSerialControlCommand(widget.template, value));
      if (sent) {
        updateWidget(widget.id, (current) => (current.type === "input" ? { ...current, value } : current));
      }
    };
    return (
      <div className="space-y-2">
        <Label htmlFor={`${widget.id}-runtime`}>{widget.label}</Label>
        <div className="flex gap-2">
          <Input
            id={`${widget.id}-runtime`}
            value={value}
            disabled={!connected}
            onChange={(event) => setRuntimeValues((current) => ({ ...current, [widget.id]: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === "Enter") void sendInput();
            }}
          />
          <Button size="icon" disabled={!connected} onClick={() => void sendInput()} title="发送">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/10">
      <datalist id="serial-control-channels">
        {availableChannels.map((channel) => (
          <option key={channel} value={channel} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-white/70 px-4 py-3">
        <LayoutDashboard className="h-4 w-4 text-primary" />
        {editing ? (
          <Input
            value={panel.name}
            onChange={(event) => setPanel((current) => ({ ...current, name: event.target.value }))}
            className="h-8 w-48"
            aria-label="控制面板名称"
          />
        ) : (
          <span className="text-sm font-medium text-foreground">{panel.name}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {connected ? status : "串口未连接"} · 文本 {sendSettings.encoding.toUpperCase()} /{" "}
          {sendSettings.lineEnding.toUpperCase()} · 控件独立 TEXT/HEX
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importPanel(file);
              event.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" className="gap-1" onClick={() => importInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            导入
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void exportPanel()}>
            <Download className="h-3.5 w-3.5" />
            导出
          </Button>
          {editing && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  添加控件
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="max-h-[70vh] w-52 overflow-y-auto rounded-[20px] p-2">
                <div className="grid gap-1">
                  {(
                    [
                      ["button", "发送按钮"],
                      ["toggle", "开关"],
                      ["slider", "滑块"],
                      ["input", "参数输入"],
                      ["stepper", "参数微调"],
                      ["joystick", "摇杆"],
                      ["sequence", "命令序列"],
                      ["gauge", "能量槽"],
                      ["value", "接收数值"],
                      ["indicator", "状态灯"],
                      ["xy-chart", "XY 二维曲线"],
                      ["yt-chart", "YT 一维曲线"],
                    ] as const
                  ).map(([type, label]) => (
                    <Button key={type} variant="ghost" className="justify-start" onClick={() => addWidget(type)}>
                      {label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          <Button size="sm" variant={editing ? "default" : "outline"} className="gap-1" onClick={toggleEditing}>
            {editing ? <Play className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editing ? "运行" : "编辑"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {panel.widgets.length === 0 ? (
          <div className="flex h-full min-h-48 items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-white/60 p-8 text-center">
            <div>
              <LayoutDashboard className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-3 text-sm font-medium text-foreground">还没有快捷控件</div>
              <div className="mt-1 text-xs text-muted-foreground">点击“添加控件”，添加常用发送操作或接收数据显示。</div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {panel.widgets.map((widget, index) => (
              <div
                key={widget.id}
                draggable={editing}
                onDragStart={() => setDraggedId(widget.id)}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={(event) => editing && event.preventDefault()}
                onDrop={() => dropWidget(widget.id)}
                className={cn(
                  "rounded-[22px] border border-border/60 bg-white/85 p-4 shadow-[0_8px_18px_rgba(73,93,142,0.06)]",
                  draggedId === widget.id && "opacity-50"
                )}
                style={widget.width === 2 ? { gridColumn: "1 / -1" } : undefined}
              >
                {editing ? (
                  <>
                    <div className="mb-3 flex items-center gap-2 border-b border-border/50 pb-3">
                      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {widget.type}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                        {widget.type === "gauge" ||
                        widget.type === "value" ||
                        widget.type === "indicator" ||
                        widget.type === "xy-chart" ||
                        widget.type === "yt-chart"
                          ? "RX"
                          : widget.format.toUpperCase()}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={index === 0}
                          onClick={() => moveWidget(widget.id, -1)}
                          title="前移"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={index === panel.widgets.length - 1}
                          onClick={() => moveWidget(widget.id, 1)}
                          title="后移"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            updateWidget(widget.id, (current) => ({ ...current, width: current.width === 1 ? 2 : 1 }))
                          }
                        >
                          {widget.width === 1 ? "全宽" : "半宽"}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500"
                          onClick={() => removeWidget(widget.id)}
                          title="删除控件"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {renderEditor(widget)}
                  </>
                ) : (
                  renderControl(widget)
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
