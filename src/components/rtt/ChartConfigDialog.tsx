import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Channel,
  ChartConfig,
  ChartType,
  DataFilterKind,
  ParseMode,
  WaveformInterpolation,
} from "@/lib/chartTypes";
import { PRESET_COLORS } from "@/lib/chartTypes";
import { populateEmptyChannelsFromSamples, type ChartSample } from "@/lib/chartAutoConfig";
import { formatMatlabSos, formatMatlabVector, parseMatlabSos, parseMatlabVector } from "@/lib/chartFilter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Plus, Trash2 } from "lucide-react";

type ChartConfigSection = "basic" | "channels" | "performance" | "display" | "filter";

interface ChartConfigDialogProps {
  chartConfig: ChartConfig;
  setChartConfig: (config: ChartConfig) => void;
  trigger?: React.ReactNode;
  title?: string;
  allowJustFloat?: boolean;
  allowDataFilter?: boolean;
  initialSection?: ChartConfigSection;
  samples?: ChartSample[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ChartConfigDialog({
  chartConfig,
  setChartConfig,
  trigger,
  title = "图表配置",
  allowJustFloat = false,
  allowDataFilter = false,
  initialSection = "basic",
  samples = [],
  open: controlledOpen,
  onOpenChange,
}: ChartConfigDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<ChartConfig>(chartConfig);
  const [activeSection, setActiveSection] = useState<ChartConfigSection>(initialSection);
  const [firText, setFirText] = useState("");
  const [sosText, setSosText] = useState("");
  const [scaleText, setScaleText] = useState("1");
  const [filterError, setFilterError] = useState("");
  const [channelHint, setChannelHint] = useState("");
  const wasOpen = useRef(false);
  const open = controlledOpen ?? internalOpen;

  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    if (open && !wasOpen.current) {
      const nextConfig = populateEmptyChannelsFromSamples(chartConfig, samples);
      setLocalConfig(nextConfig);
      setActiveSection(initialSection === "filter" && !allowDataFilter ? "basic" : initialSection);
      setFirText(formatMatlabVector(nextConfig.dataFilter.firCoefficients));
      setSosText(formatMatlabSos(nextConfig.dataFilter.sosSections));
      setScaleText(formatMatlabVector(nextConfig.dataFilter.scaleValues));
      setFilterError("");
      setChannelHint(
        chartConfig.channels.length > 0
          ? ""
          : nextConfig.channels.length > 0
            ? `已根据当前缓冲区预建 ${nextConfig.channels.length} 个通道。`
            : samples.length > 0
              ? "当前缓冲区未能按所选解析模式识别出数值通道，可手动添加。"
              : "当前缓冲区暂无可用于预建通道的数据。"
      );
    }
    wasOpen.current = open;
  }, [allowDataFilter, chartConfig, initialSection, open, samples]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const handleSave = () => {
    let nextConfig = localConfig;
    const filter = localConfig.dataFilter;
    if (allowDataFilter && filter.enabled) {
      if (filter.kind !== "median" && filter.sampleRateHz <= 0) {
        setFilterError("请输入 MATLAB 设计滤波器时使用的采样率 Fs。");
        setActiveSection("filter");
        return;
      }
      if (filter.kind === "fir") {
        const coefficients = parseMatlabVector(firText);
        if (coefficients.length === 0) {
          setFilterError("FIR 系数不能为空，请粘贴 MATLAB 导出的 b 向量。");
          setActiveSection("filter");
          return;
        }
        nextConfig = { ...localConfig, dataFilter: { ...filter, firCoefficients: coefficients } };
      } else if (filter.kind === "sos") {
        const sections = parseMatlabSos(sosText);
        if (!sections) {
          setFilterError("SOS 必须由 6 个系数一组组成，且每组 a0 不能为 0。");
          setActiveSection("filter");
          return;
        }
        const scaleValues = parseMatlabVector(scaleText);
        nextConfig = {
          ...localConfig,
          dataFilter: { ...filter, sosSections: sections, scaleValues: scaleValues.length > 0 ? scaleValues : [1] },
        };
      }
    }
    setChartConfig(nextConfig);
    setOpen(false);
  };

  const isDelimiter =
    localConfig.parseMode === "delimiter" || localConfig.parseMode === "justfloat" || localConfig.parseMode === "auto";
  const sourceIndexLabel = localConfig.parseMode === "justfloat" ? "浮点序号" : "列号";
  const isXyScatter = localConfig.chartType === "xy-scatter";

  const updateDataFilter = (patch: Partial<ChartConfig["dataFilter"]>) => {
    setFilterError("");
    setLocalConfig((current) => ({
      ...current,
      dataFilter: { ...current.dataFilter, ...patch },
    }));
  };

  const updateChannel = (index: number, patch: Partial<Channel>) => {
    setLocalConfig((current) => {
      const next = current.channels.map((channel, i) => (i === index ? { ...channel, ...patch } : channel));
      // role 切到 x 时确保只保留一个 x
      if (patch.role === "x") {
        for (let i = 0; i < next.length; i += 1) {
          if (i !== index && next[i].role === "x") {
            next[i] = { ...next[i], role: "y" };
          }
        }
      }
      return { ...current, channels: next };
    });
  };

  const addChannel = () => {
    setLocalConfig((current) => {
      const usedKeys = new Set(current.channels.map((c) => c.key));
      let baseKey = "ch";
      let suffix = current.channels.length + 1;
      while (usedKeys.has(`${baseKey}${suffix}`)) suffix += 1;
      const key = `${baseKey}${suffix}`;
      return {
        ...current,
        channels: [
          ...current.channels,
          {
            key,
            name: key,
            color: PRESET_COLORS[current.channels.length % PRESET_COLORS.length],
            visible: true,
            role: "y",
            sourceIndex:
              current.parseMode === "delimiter" || current.parseMode === "justfloat"
                ? current.channels.length
                : undefined,
          },
        ],
      };
    });
  };

  const removeChannel = (index: number) => {
    setLocalConfig((current) => ({
      ...current,
      channels: current.channels.filter((_, i) => i !== index),
    }));
  };

  const moveChannel = (index: number, direction: -1 | 1) => {
    setLocalConfig((current) => {
      const next = current.channels.slice();
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, channels: next };
    });
  };

  const parseModeHint = useMemo(() => {
    switch (localConfig.parseMode) {
      case "delimiter":
        return "按分隔符切列。下方每条通道用「列号」指定从分隔后的第几列读取。";
      case "regex":
        return "用命名捕获组提取数值，如 (?<temp>\\d+\\.\\d+)。通道的 key 必须与捕获组同名。";
      case "json":
        return "整行作为 JSON 解析，按通道 key 取数值字段。通道留空时自动提取全部数值字段。";
      case "kv":
        return "自动提取行内所有 key=value 数值对。通道留空时全部保留，否则只保留命中的 key。";
      case "justfloat":
        return "解析 VOFA JustFloat：little-endian float32 数组，以 00 00 80 7F 结束。通道留空时按首帧自动生成。";
      case "auto":
        return "依次尝试 JSON → 正则 → KV → 分隔符。任意一种成功即停止。";
      default:
        return "";
    }
  }, [localConfig.parseMode]);

  const filterFields = (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-[18px] border border-border/60 px-3 py-2.5">
        <div>
          <Label>启用滤波预览</Label>
          <p className="mt-1 text-xs text-muted-foreground">仅影响波形预览，原始日志、导出和 AI 数据保持不变。</p>
        </div>
        <Switch checked={localConfig.dataFilter.enabled} onCheckedChange={(enabled) => updateDataFilter({ enabled })} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>执行函数</Label>
          <Select
            value={localConfig.dataFilter.kind}
            onValueChange={(kind: DataFilterKind) => updateDataFilter({ kind })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sos">IIR · SOS + ScaleValues</SelectItem>
              <SelectItem value="fir">FIR · b 系数</SelectItem>
              <SelectItem value="median">实时中值滤波</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {localConfig.dataFilter.kind !== "median" && (
          <NumberField
            id="filterSampleRateHz"
            label="MATLAB 设计采样率 Fs (Hz)"
            value={localConfig.dataFilter.sampleRateHz}
            onChange={(sampleRateHz) => updateDataFilter({ sampleRateHz: Math.max(sampleRateHz, 0) })}
          />
        )}
      </div>

      {localConfig.dataFilter.kind === "fir" && (
        <MatlabTextField
          id="firCoefficients"
          label="FIR 系数 b"
          value={firText}
          placeholder="[0.1 0.2 0.4 0.2 0.1]"
          onChange={(value) => {
            setFilterError("");
            setFirText(value);
          }}
        />
      )}

      {localConfig.dataFilter.kind === "sos" && (
        <div className="space-y-3">
          <MatlabTextField
            id="sosSections"
            label="SOS Matrix（每行 b0 b1 b2 a0 a1 a2）"
            value={sosText}
            placeholder={"1 2 1 1 -1.8 0.81;\n1 2 1 1 -1.6 0.64"}
            onChange={(value) => {
              setFilterError("");
              setSosText(value);
            }}
          />
          <MatlabTextField
            id="scaleValues"
            label="g / ScaleValues（留空按 1）"
            value={scaleText}
            placeholder="1"
            rows={2}
            onChange={(value) => {
              setFilterError("");
              setScaleText(value);
            }}
          />
        </div>
      )}

      {localConfig.dataFilter.kind === "median" && (
        <NumberField
          id="medianWindowSize"
          label="窗口大小（奇数，3-255）"
          value={localConfig.dataFilter.medianWindowSize}
          onChange={(value) => {
            const clamped = Math.min(Math.max(Math.round(value), 3), 255);
            updateDataFilter({ medianWindowSize: clamped % 2 === 0 ? Math.min(clamped + 1, 255) : clamped });
          }}
        />
      )}

      <ToggleRow
        label="叠加显示原始曲线"
        checked={localConfig.dataFilter.showOriginal}
        onCheckedChange={(showOriginal) => updateDataFilter({ showOriginal })}
      />

      {filterError && <p className="text-sm text-destructive">{filterError}</p>}
      <p className="text-xs leading-5 text-muted-foreground">
        Filter Designer 可通过 <code className="font-mono">filterDesigner</code> 打开。高阶 IIR 推荐导出 SOS Matrix 与
        ScaleValues；参数 Fs 与实际采样率不一致时，波形会显示提醒。
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm" variant="outline" className="gap-1">
              <Settings className="h-3.5 w-3.5" />
              配置图表
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-5xl" style={{ width: "min(calc(100vw - 1rem), 64rem)" }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-[20px] border border-border/60 bg-muted/20 p-2">
            {(
              [
                ["basic", "基础"],
                ["channels", "通道"],
                ["performance", "性能与采样"],
                ["display", "显示"],
                ...(allowDataFilter ? [["filter", "MATLAB 滤波"]] : []),
              ] as Array<[ChartConfigSection, string]>
            ).map(([section, label]) => (
              <Button
                key={section}
                size="sm"
                variant={activeSection === section ? "default" : "ghost"}
                onClick={() => setActiveSection(section)}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* 1. 启用 + 解析模式 + 图表类型 */}
          {activeSection === "basic" && (
            <section className="rounded-[24px] border border-border/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">基础</div>
                  <p className="text-xs text-muted-foreground">关掉开关后，图表面板不会再消费数据。</p>
                </div>
                <Switch
                  checked={localConfig.enabled}
                  onCheckedChange={(checked) => setLocalConfig({ ...localConfig, enabled: checked })}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="parseMode">解析模式</Label>
                  <Select
                    value={localConfig.parseMode}
                    onValueChange={(value: ParseMode) => setLocalConfig({ ...localConfig, parseMode: value })}
                  >
                    <SelectTrigger id="parseMode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动</SelectItem>
                      <SelectItem value="delimiter">分隔符</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="kv">KV (key=value)</SelectItem>
                      <SelectItem value="regex">正则</SelectItem>
                      {allowJustFloat && <SelectItem value="justfloat">JustFloat / VOFA RawData</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chartType">图表类型</Label>
                  <Select
                    value={localConfig.chartType}
                    onValueChange={(value: ChartType) => setLocalConfig({ ...localConfig, chartType: value })}
                  >
                    <SelectTrigger id="chartType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="waveform">波形示波器</SelectItem>
                      <SelectItem value="line">折线图</SelectItem>
                      <SelectItem value="bar">柱状图</SelectItem>
                      <SelectItem value="scatter">散点图（按时间）</SelectItem>
                      <SelectItem value="xy-scatter">XY 散点图</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-5">{parseModeHint}</p>

              {isXyScatter && (
                <p className="text-xs text-muted-foreground leading-5">
                  XY 散点图需要一条通道把「角色」选成「X」，其余通道作为 Y 值。
                </p>
              )}
            </section>
          )}

          {/* 2. 模式专属字段 */}
          {activeSection === "basic" &&
            (localConfig.parseMode === "delimiter" || localConfig.parseMode === "regex") && (
              <section className="rounded-[24px] border border-border/60 p-4 space-y-3">
                <div className="text-sm font-medium">
                  {localConfig.parseMode === "delimiter" ? "分隔符" : "正则表达式"}
                </div>

                {localConfig.parseMode === "delimiter" && (
                  <div className="space-y-2">
                    <Label htmlFor="delimiter">分隔符（字符或转义序列）</Label>
                    <Input
                      id="delimiter"
                      value={localConfig.delimiter}
                      placeholder=", / \t / ; / 空格"
                      onChange={(event) => setLocalConfig({ ...localConfig, delimiter: event.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      例如 <code className="font-mono">20,4997.32,122954.44</code> 用{" "}
                      <code className="font-mono">,</code>。
                    </p>
                  </div>
                )}

                {localConfig.parseMode === "regex" && (
                  <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
                    <div className="space-y-2">
                      <Label htmlFor="regexPattern">正则表达式</Label>
                      <Input
                        id="regexPattern"
                        value={localConfig.regexPattern}
                        placeholder="temp:(?<temp>\d+\.\d+)"
                        className="font-mono"
                        onChange={(event) => setLocalConfig({ ...localConfig, regexPattern: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="regexFlags">标志</Label>
                      <Input
                        id="regexFlags"
                        value={localConfig.regexFlags || ""}
                        placeholder="g / gi"
                        onChange={(event) => setLocalConfig({ ...localConfig, regexFlags: event.target.value })}
                      />
                    </div>
                  </div>
                )}
              </section>
            )}

          {/* 3. 通道表格 */}
          {activeSection === "channels" && (
            <section className="rounded-[24px] border border-border/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">通道</div>
                  <p className="text-xs text-muted-foreground">一行一个通道，统一管理「字段名 / 显示样式 / X 轴」。</p>
                </div>
                <Button size="sm" variant="outline" onClick={addChannel}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  添加
                </Button>
              </div>

              {channelHint && <p className="text-xs leading-5 text-muted-foreground">{channelHint}</p>}

              {localConfig.channels.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  还没有通道。
                  {(localConfig.parseMode === "json" || localConfig.parseMode === "kv") &&
                    "（留空时会自动提取所有数值字段）"}
                  {localConfig.parseMode === "justfloat" && "（留空时会按首个有效帧自动生成通道）"}
                </div>
              ) : (
                <div className="space-y-2">
                  <ChannelHeaderRow
                    isDelimiter={isDelimiter}
                    sourceIndexLabel={sourceIndexLabel}
                    isXyScatter={isXyScatter}
                  />
                  {localConfig.channels.map((channel, index) => (
                    <ChannelRow
                      key={`${channel.key}-${index}`}
                      channel={channel}
                      index={index}
                      total={localConfig.channels.length}
                      isDelimiter={isDelimiter}
                      isXyScatter={isXyScatter}
                      onChange={(patch) => updateChannel(index, patch)}
                      onMove={(dir) => moveChannel(index, dir)}
                      onRemove={() => removeChannel(index)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {allowDataFilter && activeSection === "filter" && filterFields}

          {/* 4. 性能与采样 */}
          {activeSection === "performance" && (
            <section className="rounded-[24px] border border-border/60 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <NumberField
                  id="maxDataPoints"
                  label="最大数据点数"
                  value={localConfig.maxDataPoints}
                  onChange={(value) => setLocalConfig({ ...localConfig, maxDataPoints: Math.max(value, 100) })}
                />
                <NumberField
                  id="visiblePointLimit"
                  label="可视点数 (0=自动)"
                  value={localConfig.visiblePointLimit}
                  onChange={(value) => setLocalConfig({ ...localConfig, visiblePointLimit: Math.max(value, 0) })}
                />
                <NumberField
                  id="updateInterval"
                  label="独立窗口刷新间隔 (ms)"
                  value={localConfig.updateInterval}
                  onChange={(value) => setLocalConfig({ ...localConfig, updateInterval: Math.max(value, 16) })}
                />
                <NumberField
                  id="sampleRateHz"
                  label="采样率 (Hz, 0=自动)"
                  value={localConfig.sampleRateHz}
                  onChange={(value) => setLocalConfig({ ...localConfig, sampleRateHz: Math.max(value, 0) })}
                />
                <NumberField
                  id="fftWindowSize"
                  label="FFT 窗口大小 (32-4096)"
                  value={localConfig.fftWindowSize}
                  onChange={(value) =>
                    setLocalConfig({
                      ...localConfig,
                      fftWindowSize: Math.min(Math.max(value, 32), 4096),
                    })
                  }
                />
              </div>
            </section>
          )}

          {/* 5. 显示选项 */}
          {activeSection === "display" && (
            <section className="rounded-[24px] border border-border/60 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                {localConfig.chartType === "waveform" && (
                  <div className="space-y-1.5 rounded-[18px] border border-border/60 px-3 py-2.5">
                    <Label>波形连接方式</Label>
                    <Select
                      value={localConfig.waveformInterpolation}
                      onValueChange={(waveformInterpolation: WaveformInterpolation) =>
                        setLocalConfig({ ...localConfig, waveformInterpolation })
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
                <ToggleRow
                  label="显示网格"
                  checked={localConfig.showGrid}
                  onCheckedChange={(checked) => setLocalConfig({ ...localConfig, showGrid: checked })}
                />
                <ToggleRow
                  label="显示图例"
                  checked={localConfig.showLegend}
                  onCheckedChange={(checked) => setLocalConfig({ ...localConfig, showLegend: checked })}
                />
                <ToggleRow
                  label="显示 Tooltip"
                  checked={localConfig.showTooltip}
                  onCheckedChange={(checked) => setLocalConfig({ ...localConfig, showTooltip: checked })}
                />
                <ToggleRow
                  label="启用动画"
                  checked={localConfig.animationEnabled}
                  onCheckedChange={(checked) => setLocalConfig({ ...localConfig, animationEnabled: checked })}
                />
              </div>
            </section>
          )}
        </div>

        <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 mt-4 flex justify-end gap-2 border-t border-border/60 bg-background/90 px-5 py-4 backdrop-blur">
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存配置</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChannelHeaderRow({
  isDelimiter,
  sourceIndexLabel,
  isXyScatter,
}: {
  isDelimiter: boolean;
  sourceIndexLabel: string;
  isXyScatter: boolean;
}) {
  return (
    <div
      className="grid items-center gap-2 px-2 text-[11px] uppercase tracking-wide text-muted-foreground"
      style={{ gridTemplateColumns: gridTemplate(isDelimiter, isXyScatter) }}
    >
      <span>键</span>
      {isDelimiter && <span>{sourceIndexLabel}</span>}
      <span>显示名称</span>
      <span>单位</span>
      <span>颜色</span>
      {isXyScatter && <span>角色</span>}
      <span className="text-center">显示</span>
      <span />
    </div>
  );
}

function ChannelRow({
  channel,
  index,
  total,
  isDelimiter,
  isXyScatter,
  onChange,
  onMove,
  onRemove,
}: {
  channel: Channel;
  index: number;
  total: number;
  isDelimiter: boolean;
  isXyScatter: boolean;
  onChange: (patch: Partial<Channel>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="grid items-center gap-2 rounded-[18px] border border-border/60 bg-white/65 p-2"
      style={{ gridTemplateColumns: gridTemplate(isDelimiter, isXyScatter) }}
    >
      <Input
        value={channel.key}
        placeholder="key"
        onChange={(e) => onChange({ key: e.target.value })}
        className="h-9"
      />
      {isDelimiter && (
        <Input
          type="number"
          min={0}
          value={channel.sourceIndex ?? ""}
          placeholder="列号"
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = raw === "" ? undefined : Math.max(parseInt(raw, 10) || 0, 0);
            onChange({ sourceIndex: parsed });
          }}
          className="h-9"
        />
      )}
      <Input
        value={channel.name}
        placeholder={channel.key}
        onChange={(e) => onChange({ name: e.target.value })}
        className="h-9"
      />
      <Input
        value={channel.unit ?? ""}
        placeholder="℃ / Hz"
        onChange={(e) => onChange({ unit: e.target.value || undefined })}
        className="h-9"
      />
      <input
        type="color"
        value={channel.color}
        onChange={(e) => onChange({ color: e.target.value })}
        className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
        aria-label="颜色"
      />
      {isXyScatter && (
        <Select value={channel.role ?? "y"} onValueChange={(value) => onChange({ role: value as "x" | "y" })}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="y">Y</SelectItem>
            <SelectItem value="x">X</SelectItem>
          </SelectContent>
        </Select>
      )}
      <div className="flex justify-center">
        <Switch checked={channel.visible} onCheckedChange={(checked) => onChange({ visible: checked })} />
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label="上移"
        >
          ↑
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          aria-label="下移"
        >
          ↓
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onRemove} aria-label="删除">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function gridTemplate(isDelimiter: boolean, isXyScatter: boolean) {
  // [key] [sourceIndex?] [name] [unit] [color] [role?] [visible] [actions]
  const cols = ["minmax(0, 1.2fr)"];
  if (isDelimiter) cols.push("80px");
  cols.push("minmax(0, 1.4fr)");
  cols.push("80px");
  cols.push("56px");
  if (isXyScatter) cols.push("80px");
  cols.push("64px");
  cols.push("auto");
  return cols.join(" ");
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" value={value} onChange={(event) => onChange(parseFloat(event.target.value) || 0)} />
    </div>
  );
}

function MatlabTextField({
  id,
  label,
  value,
  placeholder,
  rows = 4,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-[18px] border border-border/60 px-3 py-2">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
