import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  CircleHelp,
  Download,
  GripHorizontal,
  GripVertical,
  LayoutDashboard,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Play,
  Plus,
  Send,
  Settings2,
  Trash2,
  Upload,
  ExternalLink,
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
  clampFloatingPanelPosition,
  loadSerialControlPanel,
  joystickPointFromRatio,
  parseSerialCommandSequence,
  parseSerialControlPanel,
  renderSerialControlCommand,
  renderSerialJoystickCommand,
  saveSerialControlPanel,
  SERIAL_CONTROL_WIDGET_GROUPS,
  type SerialControlPanelConfig,
  type SerialControlWidget,
  type SerialControlWidgetType,
  type SerialJoystickWidget,
} from "@/lib/serialControlPanel";
import { cn } from "@/lib/utils";
import { exportJson } from "@/lib/exporters";
import { SerialControlMiniChart } from "./SerialControlMiniChart";
import { SerialImu3DControl } from "./SerialImu3D";
import { SerialViewer, type SerialViewerData } from "./SerialViewer";
import { SignalPlotCanvas } from "@/components/rtt/SignalPlotCanvas";
import { useChartWorkspaceControls } from "@/hooks/useChartWorkspaceHost";
import type { ChartConfig, ChartDataPoint, ChartSeries } from "@/lib/chartTypes";
import type { ControlPanelSource } from "@/stores/controlPanelStore";

type RuntimeValue = string | number | boolean | { x: number; y: number };
const EMPTY_CHART_VALUES: Record<string, number> = {};
const CANVAS_GAP = 12;
const MIN_WIDGET_WIDTH = 200;
const MIN_WIDGET_HEIGHT = 96;
const WIDGET_INPUT_DOC_URL = "https://embeddedkitorg.github.io/EK-OmniProbe/#/SERIAL_CONTROL_PANEL_GUIDE";
const WIDGET_INPUT_HELP: Record<
  SerialControlWidgetType,
  { description: string; sampleLabel: string; example: string; flow: string; docId: string }
> = {
  button: {
    description: "点击后把命令原样发给设备。",
    sampleLabel: "设备默认收到（TEXT）",
    example: "PING\\n",
    flow: "点击 → PING → UTF-8 编码 → 追加 LF → 设备",
    docId: "button",
  },
  toggle: {
    description: "切换开关时分别发送开启或关闭命令。",
    sampleLabel: "设备默认收到（TEXT）",
    example: "LED=1\\n  或  LED=0\\n",
    flow: "切换状态 → 选择命令 → 编码并追加换行 → 设备",
    docId: "toggle",
  },
  slider: {
    description: "把当前数值替换模板中的 {value} 后发送。",
    sampleLabel: "设备默认收到（TEXT）",
    example: "PWM=128\\n",
    flow: "0–255 的值 → PWM={value} → 松手发送",
    docId: "slider",
  },
  input: {
    description: "把输入内容替换模板中的 {value} 后发送。",
    sampleLabel: "设备默认收到（TEXT）",
    example: "hello\\n",
    flow: "用户输入 → {value} → 按 Enter 或发送按钮 → 设备",
    docId: "input",
  },
  stepper: {
    description: "按步长调整数值并替换模板中的 {value}。",
    sampleLabel: "设备默认收到（TEXT）",
    example: "PARAM=42\\n",
    flow: "0–100 的值 → PARAM={value} → 设备",
    docId: "stepper",
  },
  joystick: {
    description: "把二维坐标替换模板中的 {x}、{y} 后发送。",
    sampleLabel: "设备默认收到（TEXT）",
    example: "X=25,Y=-40\\n",
    flow: "摇杆坐标 → X={x},Y={y} → 最快每 100ms 发送",
    docId: "joystick",
  },
  sequence: {
    description: "按从上到下的顺序发送多行命令。",
    sampleLabel: "设备默认依次收到（TEXT）",
    example: "AT\\n  然后  AT+GMR\\n",
    flow: "每个非空行 → 间隔 100ms → 编码并追加换行 → 设备",
    docId: "sequence",
  },
  value: {
    description: "显示一个数值通道的最新值。",
    sampleLabel: "设备每行输出（JSON）",
    example: '{"temp":25.3}',
    flow: "设备 → 解析为 temp → 接收通道 key 填 temp",
    docId: "value",
  },
  indicator: {
    description: "通道值达到阈值时点亮状态灯。",
    sampleLabel: "设备每行输出（JSON）",
    example: '{"ready":1}',
    flow: "设备 → 解析为 ready → 与阈值比较",
    docId: "indicator",
  },
  gauge: {
    description: "把通道最新值映射到配置的上下限。",
    sampleLabel: "设备每行输出（JSON）",
    example: '{"battery":78}',
    flow: "设备 → 解析为 battery → 映射到能量槽",
    docId: "gauge",
  },
  "serial-log": {
    description: "显示已经按接收分帧规则切出的原始 RX/TX 行。",
    sampleLabel: "设备可直接输出",
    example: "boot ok\\ntemp=25.3\\n",
    flow: "设备字节 → 接收分帧 → 日志；不经过数值解析",
    docId: "serial-log",
  },
  "yt-chart": {
    description: "以接收时间为横轴显示最多 6 个数值通道。",
    sampleLabel: "设备每行输出（JSON）",
    example: '{"ch1":1.2,"ch2":3.4}',
    flow: "设备 → 解析为 ch1/ch2 → Y 通道绑定",
    docId: "yt-chart",
  },
  "fft-chart": {
    description: "对最多 6 个时域数值通道实时计算频谱。",
    sampleLabel: "设备连续逐行输出（JSON）",
    example: '{"ch1":1.2,"ch2":3.4}',
    flow: "连续时域采样 → ch1/ch2 → FFT；不要输入频谱结果",
    docId: "fft-chart",
  },
  "xy-chart": {
    description: "分别使用一个 X 通道和一个 Y 通道绘制轨迹。",
    sampleLabel: "设备每行输出（JSON）",
    example: '{"x":0.3,"y":0.8}',
    flow: "同一采样帧 → x/y → 配对为一个轨迹点",
    docId: "xy-chart",
  },
  "imu-3d": {
    description: "欧拉角直驱分别读取 Roll、Pitch、Yaw。",
    sampleLabel: "设备每行输出（JSON）",
    example: '{"roll":10.2,"pitch":-3.1,"yaw":45}',
    flow: "同一采样帧 → roll/pitch/yaw → 3D 姿态",
    docId: "imu-3d",
  },
};

export interface ControlPanelData extends SerialViewerData {
  chartData: ChartDataPoint[];
  chartConfig: ChartConfig;
  sendSettings: {
    encoding: string;
    lineEnding: string;
    hexMode: boolean;
  };
}

interface SerialControlPanelProps {
  sendPayload?: (text: string, options?: { hexMode?: boolean }) => Promise<void>;
  showWorkspaceActions?: boolean;
  source?: ControlPanelSource;
  onSourceChange?: (source: ControlPanelSource) => void;
  data?: ControlPanelData;
  canSend?: boolean;
  onOpenChart?: () => void;
  sourceDescription?: string;
  onOpenSourceSettings?: () => void;
}

function SerialSignalPreview({
  widget,
  showWorkspaceActions,
  source,
  chartData,
  chartConfig,
  onOpenChart,
}: {
  widget: Extract<SerialControlWidget, { type: "yt-chart" | "fft-chart" }>;
  showWorkspaceActions: boolean;
  source: ControlPanelSource;
  chartData: ChartDataPoint[];
  chartConfig: ChartConfig;
  onOpenChart: () => void;
}) {
  const { openDetachedWindow } = useChartWorkspaceControls(source);
  const domain = widget.type === "fft-chart" ? "fft" : "time";
  const channelKeys =
    widget.channels.length > 0
      ? widget.channels
      : chartConfig.channels.filter((item) => item.visible).map((item) => item.key);
  const series: ChartSeries[] = channelKeys.slice(0, 6).map((key, index) => {
    const configured = chartConfig.channels.find((item) => item.key === key);
    return (
      configured ?? {
        key,
        name: key,
        color: ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4"][index % 6],
        visible: true,
      }
    );
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{widget.label}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase">{domain}</span>
        {showWorkspaceActions && (
          <div className="ml-auto flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onOpenChart} title="打开图形工作台">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => void openDetachedWindow()}
              title="独立窗口"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-background/70">
        {series.length > 0 ? (
          <SignalPlotCanvas
            chartData={chartData.slice(-widget.pointLimit)}
            series={series}
            chartConfig={{
              ...chartConfig,
              visiblePointLimit: widget.pointLimit,
              waveformInterpolation:
                widget.type === "yt-chart" ? widget.interpolation : chartConfig.waveformInterpolation,
            }}
            domain={domain}
            className="h-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            请在右侧绑定显示通道
          </div>
        )}
      </div>
    </div>
  );
}

function initialRuntimeValues(panel: SerialControlPanelConfig) {
  return Object.fromEntries(
    panel.widgets.flatMap<[string, RuntimeValue]>((widget) =>
      widget.type === "joystick"
        ? [[widget.id, { x: widget.x, y: widget.y }]]
        : "value" in widget
          ? [[widget.id, widget.value]]
          : []
    )
  ) as Record<string, RuntimeValue>;
}

export function SerialControlPanel({
  sendPayload = sendSerialPayload,
  showWorkspaceActions = true,
  source = "serial",
  onSourceChange,
  data,
  canSend = true,
  onOpenChart,
  sourceDescription,
  onOpenSourceSettings,
}: SerialControlPanelProps = {}) {
  const serialData = useSerialStore(
    useShallow((state) => ({
      connected: state.connected,
      running: state.running,
      lines: state.lines,
      autoScroll: state.autoScroll,
      showTimestamp: state.showTimestamp,
      timestampFormat: state.timestampFormat,
      showDirectionPrefix: state.showDirectionPrefix,
      displayMode: state.displayMode,
      searchQuery: state.searchQuery,
      sendSettings: state.sendSettings,
      chartData: state.chartData,
      chartConfig: state.chartConfig,
    }))
  );
  const setSerialViewMode = useSerialStore((state) => state.setViewMode);
  const sourceData = data ?? serialData;
  const { connected, sendSettings, chartData, chartConfig } = sourceData;
  const latestValues = chartData[chartData.length - 1]?.values ?? EMPTY_CHART_VALUES;
  const chartChannels = chartConfig.channels;
  const sendEnabled = connected && canSend;
  const addLog = useLogStore((state) => state.addLog);
  const [panel, setPanel] = useState(loadSerialControlPanel);
  const [editing, setEditing] = useState(panel.widgets.length === 0);
  const [paletteOpen, setPaletteOpen] = useState(() => !window.matchMedia("(max-width: 1100px)").matches);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(panel.widgets[0]?.id ?? null);
  const [runtimeValues, setRuntimeValues] = useState(() => initialRuntimeValues(panel));
  const [draggedType, setDraggedType] = useState<SerialControlWidgetType | null>(null);
  const [gesture, setGesture] = useState<{ id: string; mode: "move" | "resize" } | null>(null);
  const [status, setStatus] = useState("等待操作");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorPosition, setInspectorPosition] = useState({ x: 0, y: 0 });
  const [runningSequenceId, setRunningSequenceId] = useState<string | null>(null);
  const lastContinuousSendRef = useRef<Record<string, number>>({});
  const runningSequenceRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const inspectorDragRef = useRef<{
    startX: number;
    startY: number;
    position: { x: number; y: number };
  } | null>(null);
  const gestureStartRef = useRef<{
    id: string;
    x: number;
    y: number;
    widgetLeft: number;
    widgetTop: number;
    width: number;
    height: number;
    mode: "move" | "resize";
  } | null>(null);
  const availableChannels = Array.from(
    new Set([...chartChannels.map((channel) => channel.key), ...Object.keys(latestValues)])
  );

  useEffect(() => saveSerialControlPanel(panel), [panel]);

  useEffect(() => {
    const compactLayout = window.matchMedia("(max-width: 1100px)");
    const collapsePalette = (event: MediaQueryListEvent) => {
      if (event.matches) setPaletteOpen(false);
    };

    compactLayout.addEventListener("change", collapsePalette);
    return () => compactLayout.removeEventListener("change", collapsePalette);
  }, []);

  useEffect(() => {
    if (editing) setInspectorOpen(true);
  }, [editing]);

  useEffect(() => {
    const keepInspectorInBounds = () => {
      const workspace = workspaceRef.current;
      const inspector = inspectorRef.current;
      if (!workspace || !inspector) return;
      setInspectorPosition((position) =>
        clampFloatingPanelPosition(
          position,
          { width: workspace.clientWidth, height: workspace.clientHeight },
          { width: inspector.offsetWidth, height: inspector.offsetHeight }
        )
      );
    };
    window.addEventListener("resize", keepInspectorInBounds);
    return () => window.removeEventListener("resize", keepInspectorInBounds);
  }, []);

  const moveInspector = (position: { x: number; y: number }) => {
    const workspace = workspaceRef.current;
    const inspector = inspectorRef.current;
    if (!workspace || !inspector) return;
    setInspectorPosition(
      clampFloatingPanelPosition(
        position,
        { width: workspace.clientWidth, height: workspace.clientHeight },
        { width: inspector.offsetWidth, height: inspector.offsetHeight }
      )
    );
  };

  const startInspectorDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    inspectorDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      position: inspectorPosition,
    };
  };

  const dragInspector = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = inspectorDragRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveInspector({
      x: drag.position.x + event.clientX - drag.startX,
      y: drag.position.y + event.clientY - drag.startY,
    });
  };

  const finishInspectorDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    inspectorDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const moveInspectorWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const movement = {
      ArrowLeft: { x: -16, y: 0 },
      ArrowRight: { x: 16, y: 0 },
      ArrowUp: { x: 0, y: -16 },
      ArrowDown: { x: 0, y: 16 },
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    moveInspector({ x: inspectorPosition.x + movement.x, y: inspectorPosition.y + movement.y });
  };

  const updateWidget = (id: string, updater: (widget: SerialControlWidget) => SerialControlWidget) => {
    setPanel((current) => ({
      ...current,
      widgets: current.widgets.map((widget) => (widget.id === id ? updater(widget) : widget)),
    }));
  };

  const addWidget = (type: SerialControlWidgetType, position?: { x: number; y: number }) => {
    const created = createSerialControlWidget(type);
    const widget = {
      ...created,
      left: Math.max(0, position?.x ?? 0),
      top:
        position?.y ?? panel.widgets.reduce((bottom, item) => Math.max(bottom, item.top + item.height + CANVAS_GAP), 0),
    };
    setPanel((current) => ({ ...current, widgets: [...current.widgets, widget] }));
    if ("value" in widget) setRuntimeValues((current) => ({ ...current, [widget.id]: widget.value }));
    setSelectedWidgetId(widget.id);
  };

  const removeWidget = (id: string) => {
    setPanel((current) => ({ ...current, widgets: current.widgets.filter((widget) => widget.id !== id) }));
    setSelectedWidgetId((current) => (current === id ? null : current));
  };

  const startGesture = (
    widget: SerialControlWidget,
    mode: "move" | "resize",
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!editing || !canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureStartRef.current = {
      id: widget.id,
      x: event.clientX,
      y: event.clientY,
      widgetLeft: widget.left,
      widgetTop: widget.top,
      width: widget.width,
      height: widget.height,
      mode,
    };
    setGesture({ id: widget.id, mode });
    setSelectedWidgetId(widget.id);
  };

  const moveGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = gestureStartRef.current;
    if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    updateWidget(start.id, (current) =>
      start.mode === "move"
        ? { ...current, left: Math.max(0, start.widgetLeft + dx), top: Math.max(0, start.widgetTop + dy) }
        : {
            ...current,
            width: Math.min(2_400, Math.max(MIN_WIDGET_WIDTH, start.width + dx)),
            height: Math.min(2_000, Math.max(MIN_WIDGET_HEIGHT, start.height + dy)),
          }
    );
  };

  const finishGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const movedId = gestureStartRef.current?.id;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (movedId) {
      setPanel((current) => ({
        ...current,
        widgets: [
          ...current.widgets.filter((item) => item.id !== movedId),
          ...current.widgets.filter((item) => item.id === movedId),
        ],
      }));
    }
    gestureStartRef.current = null;
    setGesture(null);
  };

  const sendCommand = async (widget: SerialControlWidget, command: string) => {
    if (!command.trim()) {
      addLog("warn", `${widget.label} 的发送内容为空`);
      return false;
    }
    try {
      await sendPayload(command, { hexMode: widget.format === "hex" });
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
      setSelectedWidgetId(nextPanel.widgets[0]?.id ?? null);
      setStatus(`已导入 ${nextPanel.name}`);
    } catch (error) {
      addLog("error", `控制面板导入失败: ${error}`);
    }
  };

  const toggleEditing = () => {
    if (!editing) {
      setEditing(true);
      setSelectedWidgetId(panel.widgets[0]?.id ?? null);
      return;
    }
    const normalized = parseSerialControlPanel(panel);
    setPanel(normalized);
    setRuntimeValues(initialRuntimeValues(normalized));
    setEditing(false);
    setSelectedWidgetId(null);
  };

  const renderEditor = (widget: SerialControlWidget) => (
    <div className="space-y-3">
      <div className="grid gap-3">
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
          widget.type !== "serial-log" &&
          widget.type !== "fft-chart" &&
          widget.type !== "xy-chart" &&
          widget.type !== "yt-chart" &&
          widget.type !== "imu-3d" && (
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

      {(widget.type === "fft-chart" || widget.type === "yt-chart") && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Y 通道（最多 6 个）</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={widget.channels.length >= 6}
              onClick={() =>
                updateWidget(widget.id, (current) =>
                  current.type === "fft-chart" || current.type === "yt-chart"
                    ? { ...current, channels: [...current.channels, ""] }
                    : current
                )
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              添加
            </Button>
          </div>
          {widget.channels.map((channel, index) => (
            <div key={`${widget.id}-channel-${index}`} className="flex gap-2">
              <Input
                list="serial-control-channels"
                value={channel}
                onChange={(event) =>
                  updateWidget(widget.id, (current) => {
                    if (current.type !== "fft-chart" && current.type !== "yt-chart") return current;
                    const channels = [...current.channels];
                    channels[index] = event.target.value;
                    return { ...current, channels };
                  })
                }
                placeholder={`Y${index + 1}，例如 ch${index + 1}`}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0 text-red-500"
                onClick={() =>
                  updateWidget(widget.id, (current) =>
                    current.type === "fft-chart" || current.type === "yt-chart"
                      ? { ...current, channels: current.channels.filter((_, itemIndex) => itemIndex !== index) }
                      : current
                  )
                }
                title="删除通道"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {widget.channels.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              {widget.type === "fft-chart" ? "留空时跟随图形工作台中已启用的通道。" : "添加一个或多个 Y 通道。"}
            </p>
          )}
        </div>
      )}

      {widget.type === "sequence" && (
        <div className="grid gap-3">
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
        <div className="grid gap-3">
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
        <div className="grid gap-3">
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
          <div className="grid gap-3">
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
          <div className="grid gap-3">
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

      {(widget.type === "gauge" || widget.type === "value" || widget.type === "indicator") && (
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${widget.id}-channel`}>接收通道 key</Label>
            <Input
              id={`${widget.id}-channel`}
              list="serial-control-channels"
              value={widget.channel}
              onChange={(event) =>
                updateWidget(widget.id, (current) =>
                  current.type === "gauge" || current.type === "value" || current.type === "indicator"
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

      {widget.type === "serial-log" && (
        <div className="space-y-1.5">
          <Label>日志方向</Label>
          <Select
            value={widget.direction}
            onValueChange={(direction: "all" | "rx" | "tx") =>
              updateWidget(widget.id, (current) =>
                current.type === "serial-log" ? { ...current, direction } : current
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="rx">仅接收 RX</SelectItem>
              <SelectItem value="tx">仅发送 TX</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {widget.type === "xy-chart" && (
        <div className="grid gap-3">
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

      {(widget.type === "xy-chart" || widget.type === "yt-chart" || widget.type === "fft-chart") && (
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
                current.type === "xy-chart" || current.type === "yt-chart" || current.type === "fft-chart"
                  ? { ...current, pointLimit: Number(event.target.value) }
                  : current
              )
            }
          />
          <p className="text-[11px] text-muted-foreground">使用波形解析缓存中的最近 10–2000 个点。</p>
        </div>
      )}

      {widget.type === "yt-chart" && (
        <div className="space-y-1.5">
          <Label>波形连接方式</Label>
          <Select
            value={widget.interpolation}
            onValueChange={(interpolation: "linear" | "smooth") =>
              updateWidget(widget.id, (current) =>
                current.type === "yt-chart" ? { ...current, interpolation } : current
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">直线连接</SelectItem>
              <SelectItem value="smooth">平滑曲线</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {widget.type === "imu-3d" && (
        <div className="space-y-3">
          <div className="max-w-48 space-y-1.5">
            <Label>数据源</Label>
            <Select
              value={widget.sourceMode}
              onValueChange={(sourceMode: "euler" | "imu6") =>
                updateWidget(widget.id, (current) => (current.type === "imu-3d" ? { ...current, sourceMode } : current))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="euler">欧拉角直驱</SelectItem>
                <SelectItem value="imu6">原始六轴融合</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {widget.sourceMode === "euler" ? (
            <>
              <div className="grid gap-3">
                {(["rollChannel", "pitchChannel", "yawChannel"] as const).map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`${widget.id}-${key}`}>
                      {key === "rollChannel"
                        ? "Roll / X 通道"
                        : key === "pitchChannel"
                          ? "Pitch / Y 通道"
                          : "Yaw / Z 通道"}
                    </Label>
                    <Input
                      id={`${widget.id}-${key}`}
                      list="serial-control-channels"
                      value={widget[key]}
                      onChange={(event) =>
                        updateWidget(widget.id, (current) =>
                          current.type === "imu-3d" ? { ...current, [key]: event.target.value } : current
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="max-w-48 space-y-1.5">
                <Label>输入角度单位</Label>
                <Select
                  value={widget.angleUnit}
                  onValueChange={(angleUnit: "deg" | "rad") =>
                    updateWidget(widget.id, (current) =>
                      current.type === "imu-3d" ? { ...current, angleUnit } : current
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deg">角度 (°)</SelectItem>
                    <SelectItem value="rad">弧度 (rad)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3">
                {(["accelXChannel", "accelYChannel", "accelZChannel"] as const).map((key, index) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`${widget.id}-${key}`}>加速度 {"XYZ"[index]} 通道</Label>
                    <Input
                      id={`${widget.id}-${key}`}
                      list="serial-control-channels"
                      value={widget[key]}
                      onChange={(event) =>
                        updateWidget(widget.id, (current) =>
                          current.type === "imu-3d" ? { ...current, [key]: event.target.value } : current
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-3">
                {(["gyroXChannel", "gyroYChannel", "gyroZChannel"] as const).map((key, index) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`${widget.id}-${key}`}>陀螺仪 {"XYZ"[index]} 通道</Label>
                    <Input
                      id={`${widget.id}-${key}`}
                      list="serial-control-channels"
                      value={widget[key]}
                      onChange={(event) =>
                        updateWidget(widget.id, (current) =>
                          current.type === "imu-3d" ? { ...current, [key]: event.target.value } : current
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label>陀螺仪单位</Label>
                  <Select
                    value={widget.gyroUnit}
                    onValueChange={(gyroUnit: "dps" | "rad") =>
                      updateWidget(widget.id, (current) =>
                        current.type === "imu-3d" ? { ...current, gyroUnit } : current
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dps">度/秒 (°/s)</SelectItem>
                      <SelectItem value="rad">弧度/秒 (rad/s)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(["sampleRateHz", "filterAlpha"] as const).map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`${widget.id}-${key}`}>
                      {key === "sampleRateHz" ? "兜底采样率 (Hz)" : "滤波系数 α"}
                    </Label>
                    <Input
                      id={`${widget.id}-${key}`}
                      type="number"
                      min={key === "sampleRateHz" ? 1 : 0}
                      max={key === "sampleRateHz" ? 10000 : 1}
                      step={key === "sampleRateHz" ? 1 : 0.01}
                      value={widget[key]}
                      onChange={(event) =>
                        updateWidget(widget.id, (current) =>
                          current.type === "imu-3d" ? { ...current, [key]: Number(event.target.value) } : current
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-3">
                {(["gyroBiasX", "gyroBiasY", "gyroBiasZ"] as const).map((key, index) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`${widget.id}-${key}`}>陀螺零偏 {"XYZ"[index]}</Label>
                    <Input
                      id={`${widget.id}-${key}`}
                      type="number"
                      step="any"
                      value={widget[key]}
                      onChange={(event) =>
                        updateWidget(widget.id, (current) =>
                          current.type === "imu-3d" ? { ...current, [key]: Number(event.target.value) } : current
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                加速度单位可为 g 或 m/s²，但三个轴必须一致；设备静止时可在运行模式点击“静止校准”。
              </p>
            </>
          )}
          <p className="text-[11px] text-muted-foreground">
            按 X=Roll、Y=Pitch、Z=Yaw 映射；运行模式可用当前姿态归零。
          </p>
        </div>
      )}

      {widget.type === "gauge" && (
        <div className="grid gap-3">
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
        <Button
          className="h-12 w-full"
          disabled={!sendEnabled}
          onClick={() => void sendCommand(widget, widget.command)}
        >
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
            disabled={!sendEnabled || runningSequenceId !== null || commands.length === 0}
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
            disabled={!sendEnabled}
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
            disabled={!sendEnabled}
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
              disabled={!sendEnabled}
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
              disabled={!sendEnabled}
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
              disabled={!sendEnabled}
              onClick={() => commitStepperValue(widget, numericValue + widget.step)}
              aria-label={`${widget.label}增大`}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              disabled={!sendEnabled}
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
            tabIndex={sendEnabled ? 0 : -1}
            aria-label={`${widget.label}摇杆，X ${point.x}，Y ${point.y}`}
            className={cn(
              "relative mx-auto aspect-square w-full max-w-48 touch-none overflow-hidden rounded-full border border-border bg-muted/60",
              !sendEnabled && "cursor-not-allowed opacity-50"
            )}
            onPointerDown={(event) => {
              if (!sendEnabled) return;
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

    if (widget.type === "serial-log") {
      const direction = widget.direction === "all" ? undefined : widget.direction;
      return (
        <SerialViewer
          direction={direction}
          title={`${widget.label} · ${widget.direction === "all" ? "全部" : widget.direction.toUpperCase()}`}
          data={sourceData}
        />
      );
    }

    if (widget.type === "yt-chart" || widget.type === "fft-chart") {
      return (
        <SerialSignalPreview
          widget={widget}
          showWorkspaceActions={showWorkspaceActions}
          source={source}
          chartData={chartData}
          chartConfig={chartConfig}
          onOpenChart={onOpenChart ?? (() => setSerialViewMode("chart"))}
        />
      );
    }

    if (widget.type === "xy-chart") {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">{widget.label}</span>
            <span className="text-[11px] text-muted-foreground">
              {`${widget.xChannel || "X"} / ${widget.yChannel || "Y"}`}· 最近 {widget.pointLimit} 点
            </span>
          </div>
          <SerialControlMiniChart
            mode="xy"
            chartData={chartData}
            xChannel={widget.xChannel}
            yChannels={[widget.yChannel]}
            pointLimit={widget.pointLimit}
          />
        </div>
      );
    }

    if (widget.type === "imu-3d") {
      return (
        <SerialImu3DControl
          widget={widget}
          chartData={chartData}
          latestValues={latestValues}
          onUpdate={(patch) =>
            updateWidget(widget.id, (current) => (current.type === "imu-3d" ? { ...current, ...patch } : current))
          }
        />
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
            disabled={!sendEnabled}
            onChange={(event) => setRuntimeValues((current) => ({ ...current, [widget.id]: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === "Enter") void sendInput();
            }}
          />
          <Button size="icon" disabled={!sendEnabled} onClick={() => void sendInput()} title="发送">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const selectedWidget = panel.widgets.find((widget) => widget.id === selectedWidgetId);
  const widgetInputHelp =
    selectedWidget?.type === "imu-3d" && selectedWidget.sourceMode === "imu6"
      ? {
          description: "六轴融合读取三轴加速度和三轴陀螺仪。",
          sampleLabel: "设备每行输出（JSON）",
          example: '{"ax":0.01,"ay":0.02,"az":1,"gx":0.2,"gy":-0.1,"gz":0}',
          flow: "同一采样帧 → ax/ay/az/gx/gy/gz → 姿态融合",
          docId: "imu-3d",
        }
      : selectedWidget
        ? WIDGET_INPUT_HELP[selectedWidget.type]
        : undefined;
  const canvasWidth = Math.max(900, ...panel.widgets.map((widget) => widget.left + widget.width + CANVAS_GAP));
  const canvasHeight = Math.max(560, ...panel.widgets.map((widget) => widget.top + widget.height + CANVAS_GAP));
  const inspectorContent =
    editing && selectedWidget ? (
      <div className="space-y-4">
        <div className="flex items-start gap-2 border-b border-border/60 pb-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{selectedWidget.label}</div>
            <div className="text-[11px] text-muted-foreground">{selectedWidget.type}</div>
          </div>
          {widgetInputHelp && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="查看组件输入格式">
                  <CircleHelp className="h-4 w-4" />
                  <span className="sr-only">查看组件输入格式</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent side="left" align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
                <div>
                  <div className="text-sm font-semibold">{selectedWidget.label} · 格式参考</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{widgetInputHelp.description}</p>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{widgetInputHelp.sampleLabel}</div>
                  <code className="block overflow-x-auto rounded-lg bg-muted px-2 py-2 font-mono text-[11px]">
                    {widgetInputHelp.example}
                  </code>
                </div>
                <div className="rounded-lg border border-border/60 px-2 py-2 text-xs">{widgetInputHelp.flow}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() =>
                    void open(`${WIDGET_INPUT_DOC_URL}?id=${widgetInputHelp.docId}`).catch((error) =>
                      console.error("打开组件输入文档失败:", error)
                    )
                  }
                >
                  查看完整文档
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </PopoverContent>
            </Popover>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-red-500"
            onClick={() => removeWidget(selectedWidget.id)}
            title="删除组件"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["left", "X", 0],
              ["top", "Y", 0],
              ["width", "宽度", MIN_WIDGET_WIDTH],
              ["height", "高度", MIN_WIDGET_HEIGHT],
            ] as const
          ).map(([key, label, min]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`${selectedWidget.id}-${key}`}>{label}</Label>
              <Input
                id={`${selectedWidget.id}-${key}`}
                type="number"
                min={min}
                value={Math.round(selectedWidget[key])}
                onChange={(event) =>
                  updateWidget(selectedWidget.id, (current) => ({
                    ...current,
                    [key]: Math.max(min, Number(event.target.value) || min),
                  }))
                }
              />
            </div>
          ))}
        </div>
        {renderEditor(selectedWidget)}
      </div>
    ) : null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/10">
      <datalist id="serial-control-channels">
        {availableChannels.map((channel) => (
          <option key={channel} value={channel} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-white/70 px-3 py-2">
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
        <Select
          value={source}
          disabled={!onSourceChange}
          onValueChange={(value) => onSourceChange?.(value as ControlPanelSource)}
        >
          <SelectTrigger className="h-8 w-40" aria-label="控制面板数据来源">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="serial">串口</SelectItem>
            <SelectItem value="rtt">RTT</SelectItem>
            <SelectItem value="bluetooth" disabled>
              BLE（暂未实现）
            </SelectItem>
          </SelectContent>
        </Select>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium",
            connected ? "bg-emerald-500/12 text-emerald-700" : "bg-red-500/12 text-red-600"
          )}
        >
          {source === "rtt" ? "RTT" : "串口"}
          {connected ? "已连接" : "未连接"}
        </span>
        <span className="text-xs text-muted-foreground">
          {status} ·{" "}
          {canSend
            ? `发送 ${sendSettings.encoding.toUpperCase()} / ${sendSettings.lineEnding.toUpperCase()}`
            : "只读数据源"}
        </span>
        {sourceDescription && (
          <span className="max-w-64 truncate text-xs text-muted-foreground" title={sourceDescription}>
            {sourceDescription}
          </span>
        )}
        {onOpenSourceSettings && (
          <Button size="sm" variant="ghost" className="gap-1" onClick={onOpenSourceSettings}>
            <Settings2 className="h-3.5 w-3.5" />
            前往设置
          </Button>
        )}

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
          {editing && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setPaletteOpen((open) => !open)}
                title={paletteOpen ? "收起组件库" : "展开组件库"}
                aria-label={paletteOpen ? "收起组件库" : "展开组件库"}
              >
                {paletteOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                组件库
              </Button>
              <Button
                size="sm"
                variant={inspectorOpen ? "secondary" : "outline"}
                className="gap-1"
                onClick={() => setInspectorOpen((open) => !open)}
              >
                {inspectorOpen ? (
                  <PanelRightClose className="h-3.5 w-3.5" />
                ) : (
                  <PanelRightOpen className="h-3.5 w-3.5" />
                )}
                组件属性
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="gap-1" onClick={() => importInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            导入
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void exportPanel()}>
            <Download className="h-3.5 w-3.5" />
            导出
          </Button>
          <Button size="sm" variant={editing ? "default" : "outline"} className="gap-1" onClick={toggleEditing}>
            {editing ? <Play className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editing ? "运行" : "编辑"}
          </Button>
        </div>
      </div>

      <div ref={workspaceRef} className="relative flex min-h-0 flex-1 gap-2 overflow-hidden p-2">
        {editing && paletteOpen && (
          <aside className="w-52 shrink-0 overflow-y-auto rounded-[18px] border border-border/60 bg-white/75 p-3">
            <div className="text-sm font-medium">组件库</div>
            <div className="mt-1 text-[11px] text-muted-foreground">拖入画布，或点击直接添加。</div>
            <div className="mt-4 space-y-4">
              {SERIAL_CONTROL_WIDGET_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.title}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map(({ type, label }) => (
                      <button
                        key={type}
                        type="button"
                        draggable
                        onDragStart={() => {
                          setDraggedType(type);
                        }}
                        onDragEnd={() => setDraggedType(null)}
                        onClick={() => addWidget(type)}
                        className="flex min-h-16 cursor-grab flex-col items-center justify-center rounded-xl border border-border/60 bg-muted/30 px-2 text-center text-[11px] hover:border-primary/60 hover:bg-primary/5 active:cursor-grabbing"
                      >
                        <Plus className="mb-1 h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        <main
          className={cn(
            "min-h-0 flex-1 overflow-auto rounded-[18px] border bg-white/45 p-3",
            editing ? "border-dashed border-primary/45" : "border-border/60"
          )}
        >
          {editing && (
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <GripVertical className="h-4 w-4" />
              自由画布 · 拖动组件标题移动，拖动右下角连续调整大小
            </div>
          )}
          <section
            ref={canvasRef}
            className="relative min-h-full min-w-full"
            style={{ width: canvasWidth, height: canvasHeight }}
            onDragOver={(event) => editing && event.preventDefault()}
            onDrop={(event) => {
              if (!editing || !draggedType) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              addWidget(draggedType, { x: event.clientX - rect.left, y: event.clientY - rect.top });
              setDraggedType(null);
            }}
          >
            {panel.widgets.length === 0 ? (
              <div className="flex h-full min-h-64 items-center justify-center rounded-[20px] border border-dashed border-border/70 p-8 text-center">
                <div>
                  <LayoutDashboard className="mx-auto h-8 w-8 text-muted-foreground" />
                  <div className="mt-3 text-sm font-medium">空白画布</div>
                  <div className="mt-1 text-xs text-muted-foreground">把左侧组件拖到这里开始搭建。</div>
                </div>
              </div>
            ) : (
              <>
                {panel.widgets.map((widget) => (
                  <div
                    key={widget.id}
                    onClick={() => {
                      if (!editing) return;
                      setSelectedWidgetId(widget.id);
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded-[18px] border bg-white/90 p-3 shadow-[0_8px_18px_rgba(73,93,142,0.06)]",
                      editing && "border-dashed hover:border-primary/70",
                      editing && selectedWidgetId === widget.id && "border-primary ring-2 ring-primary/15",
                      gesture?.id === widget.id && "select-none"
                    )}
                    style={{
                      left: widget.left,
                      top: widget.top,
                      width: widget.width,
                      height: widget.height,
                      zIndex: selectedWidgetId === widget.id ? 2 : 1,
                    }}
                  >
                    {editing ? (
                      <>
                        <div className="mb-3 flex items-center gap-2 border-b border-border/50 pb-2">
                          <button
                            type="button"
                            className="touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
                            onPointerDown={(event) => startGesture(widget, "move", event)}
                            onPointerMove={moveGesture}
                            onPointerUp={finishGesture}
                            onPointerCancel={finishGesture}
                            aria-label={`移动 ${widget.label}`}
                            title="拖动移动组件"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {widget.type}
                          </span>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                            {widget.type === "serial-log"
                              ? widget.direction.toUpperCase()
                              : widget.type === "gauge" ||
                                  widget.type === "value" ||
                                  widget.type === "indicator" ||
                                  widget.type === "fft-chart" ||
                                  widget.type === "xy-chart" ||
                                  widget.type === "yt-chart" ||
                                  widget.type === "imu-3d"
                                ? "RX"
                                : widget.format.toUpperCase()}
                          </span>
                          <div className="ml-auto flex items-center gap-1">
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
                        <div className="pointer-events-none h-[calc(100%_-_40px)] select-none overflow-hidden opacity-80">
                          {renderControl(widget)}
                        </div>
                      </>
                    ) : (
                      renderControl(widget)
                    )}
                    {editing && (
                      <button
                        type="button"
                        draggable={false}
                        className="absolute bottom-0 right-0 h-7 w-7 touch-none cursor-se-resize rounded-tl-xl border-l border-t border-primary/40 bg-primary/10 text-primary"
                        onPointerDown={(event) => startGesture(widget, "resize", event)}
                        onPointerMove={moveGesture}
                        onPointerUp={finishGesture}
                        onPointerCancel={finishGesture}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`调整 ${widget.label} 大小`}
                        title="拖动调整大小"
                      >
                        <span className="absolute bottom-1 right-1 h-2.5 w-2.5 border-b-2 border-r-2 border-current" />
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </section>
        </main>
        {editing && (
          <aside
            ref={inspectorRef}
            className={cn(
              "absolute right-3 top-3 z-20 w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-[20px] border border-border/70 bg-white/92 p-4 shadow-[0_18px_50px_rgba(42,57,91,0.2)] backdrop-blur transition-opacity duration-200",
              !inspectorOpen && "pointer-events-none opacity-0"
            )}
            style={{
              maxHeight: "min(760px, calc(100% - 1.5rem))",
              transform: `translate3d(${inspectorPosition.x}px, ${inspectorPosition.y}px, 0)`,
            }}
          >
            <div className="sticky top-0 z-10 -mx-2 -mt-2 mb-4 flex w-[calc(100%+1rem)] items-center gap-1 rounded-xl bg-white/95 p-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 touch-none cursor-grab items-center gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium active:cursor-grabbing"
                onPointerDown={startInspectorDrag}
                onPointerMove={dragInspector}
                onPointerUp={finishInspectorDrag}
                onPointerCancel={finishInspectorDrag}
                onKeyDown={moveInspectorWithKeyboard}
                aria-label="拖动组件属性面板，可使用方向键微调位置"
              >
                <GripHorizontal className="h-4 w-4 text-muted-foreground" />
                组件属性
                <span className="ml-auto text-[11px] font-normal text-muted-foreground">拖动</span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => setInspectorOpen(false)}
                title="收起组件属性"
                aria-label="收起组件属性"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
            {inspectorContent ?? <div className="text-xs text-muted-foreground">请点击画布中的组件进行配置。</div>}
          </aside>
        )}
      </div>
    </div>
  );
}
