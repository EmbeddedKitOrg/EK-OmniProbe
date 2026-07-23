import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  GripVertical,
  LayoutDashboard,
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
  parseSerialControlPanel,
  renderSerialControlCommand,
  saveSerialControlPanel,
  type SerialControlPanelConfig,
  type SerialControlWidget,
  type SerialControlWidgetType,
} from "@/lib/serialControlPanel";
import { cn } from "@/lib/utils";
import { exportJson } from "@/lib/exporters";

function initialRuntimeValues(panel: SerialControlPanelConfig) {
  return Object.fromEntries(
    panel.widgets.flatMap((widget) => ("value" in widget ? [[widget.id, widget.value]] : []))
  ) as Record<string, string | number | boolean>;
}

export function SerialControlPanel() {
  const { connected, sendSettings } = useSerialStore(
    useShallow((state) => ({ connected: state.connected, sendSettings: state.sendSettings }))
  );
  const addLog = useLogStore((state) => state.addLog);
  const [panel, setPanel] = useState(loadSerialControlPanel);
  const [editing, setEditing] = useState(panel.widgets.length === 0);
  const [runtimeValues, setRuntimeValues] = useState(() => initialRuntimeValues(panel));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [status, setStatus] = useState("等待操作");
  const lastContinuousSendRef = useRef<Record<string, number>>({});
  const importInputRef = useRef<HTMLInputElement>(null);

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

  const commitSliderValue = (widget: Extract<SerialControlWidget, { type: "slider" }>, value: number) => {
    updateWidget(widget.id, (current) => (current.type === "slider" ? { ...current, value } : current));
    void sendSliderValue(widget, value);
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
        <div className="space-y-1.5">
          <Label>发送格式</Label>
          <Select
            value={widget.format}
            onValueChange={(format: "text" | "hex") => updateWidget(widget.id, (current) => ({ ...current, format }))}
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

      {(widget.type === "slider" || widget.type === "input") && (
        <div className="space-y-1.5">
          <Label htmlFor={`${widget.id}-template`}>发送模板</Label>
          <Input
            id={`${widget.id}-template`}
            value={widget.template}
            onChange={(event) =>
              updateWidget(widget.id, (current) =>
                current.type === "slider" || current.type === "input"
                  ? { ...current, template: event.target.value }
                  : current
              )
            }
            placeholder="PWM={value}"
            className="font-mono"
          />
          <p className="text-[11px] text-muted-foreground">使用 {"{value}"} 表示当前控件值。</p>
        </div>
      )}

      {widget.type === "slider" && (
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
                    current.type === "slider" ? { ...current, [key]: Number(event.target.value) } : current
                  )
                }
              />
            </div>
          ))}
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
              <PopoverContent align="end" className="w-52 rounded-[20px] p-2">
                <div className="grid gap-1">
                  {(
                    [
                      ["button", "发送按钮"],
                      ["toggle", "开关"],
                      ["slider", "滑块"],
                      ["input", "参数输入"],
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
              <div className="mt-1 text-xs text-muted-foreground">
                点击“添加控件”，把常用串口命令做成按钮、开关或滑块。
              </div>
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
                        {widget.format.toUpperCase()}
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
