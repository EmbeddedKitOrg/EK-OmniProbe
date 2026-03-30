import { useState } from "react";
import type { ChartConfig, ChartType, ParseMode } from "@/lib/chartTypes";
import { PRESET_COLORS } from "@/lib/chartTypes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Plus, Trash2 } from "lucide-react";

interface ChartConfigDialogProps {
  chartConfig: ChartConfig;
  setChartConfig: (config: ChartConfig) => void;
  trigger?: React.ReactNode;
  title?: string;
}

export function ChartConfigDialog({
  chartConfig,
  setChartConfig,
  trigger,
  title = "图表配置",
}: ChartConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<ChartConfig>(chartConfig);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setLocalConfig(chartConfig);
    }
    setOpen(nextOpen);
  };

  const handleSave = () => {
    setChartConfig(localConfig);
    setOpen(false);
  };

  const handleAddField = () => {
    setLocalConfig((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          index: current.fields.length,
          name: `field${current.fields.length + 1}`,
          enabled: true,
        },
      ],
    }));
  };

  const handleAddSeries = () => {
    setLocalConfig((current) => ({
      ...current,
      series: [
        ...current.series,
        {
          key: `series${current.series.length + 1}`,
          name: `系列${current.series.length + 1}`,
          color: PRESET_COLORS[current.series.length % PRESET_COLORS.length],
          visible: true,
        },
      ],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="gap-1">
            <Settings className="h-3.5 w-3.5" />
            配置图表
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto rounded-[28px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-5 rounded-[20px]">
            <TabsTrigger value="basic">基础</TabsTrigger>
            <TabsTrigger value="series">系列</TabsTrigger>
            <TabsTrigger value="delimiter">分隔符</TabsTrigger>
            <TabsTrigger value="regex">正则</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-border/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Label htmlFor="enabled">启用图表功能</Label>
                  <Switch
                    id="enabled"
                    checked={localConfig.enabled}
                    onCheckedChange={(checked) =>
                      setLocalConfig({ ...localConfig, enabled: checked })
                    }
                  />
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="parseMode">解析模式</Label>
                    <Select
                      value={localConfig.parseMode}
                      onValueChange={(value: ParseMode) =>
                        setLocalConfig({ ...localConfig, parseMode: value })
                      }
                    >
                      <SelectTrigger id="parseMode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">自动</SelectItem>
                        <SelectItem value="regex">正则</SelectItem>
                        <SelectItem value="delimiter">分隔符</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="chartType">图表类型</Label>
                    <Select
                      value={localConfig.chartType}
                      onValueChange={(value: ChartType) =>
                        setLocalConfig({ ...localConfig, chartType: value })
                      }
                    >
                      <SelectTrigger id="chartType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="waveform">波形示波器</SelectItem>
                        <SelectItem value="line">折线图</SelectItem>
                        <SelectItem value="bar">柱状图</SelectItem>
                        <SelectItem value="scatter">散点图</SelectItem>
                        <SelectItem value="xy-scatter">XY 散点图</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {localConfig.chartType === "xy-scatter" && (
                    <div className="space-y-2">
                      <Label htmlFor="xAxisField">X 轴字段</Label>
                      <Input
                        id="xAxisField"
                        value={localConfig.xAxisField || ""}
                        placeholder="x / time / angle"
                        onChange={(event) =>
                          setLocalConfig({ ...localConfig, xAxisField: event.target.value })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-border/60 p-4">
                <div className="mb-3 text-sm font-medium">采样、缓存与频谱</div>
                <div className="grid gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="maxDataPoints">最大数据点数</Label>
                    <Input
                      id="maxDataPoints"
                      type="number"
                      value={localConfig.maxDataPoints}
                      onChange={(event) =>
                        setLocalConfig({
                          ...localConfig,
                          maxDataPoints: Math.max(parseInt(event.target.value, 10) || 1000, 100),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="updateInterval">刷新间隔 (ms)</Label>
                    <Input
                      id="updateInterval"
                      type="number"
                      value={localConfig.updateInterval}
                      onChange={(event) =>
                        setLocalConfig({
                          ...localConfig,
                          updateInterval: Math.max(parseInt(event.target.value, 10) || 33, 16),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sampleRateHz">采样率 (Hz，0=自动估算)</Label>
                    <Input
                      id="sampleRateHz"
                      type="number"
                      value={localConfig.sampleRateHz}
                      onChange={(event) =>
                        setLocalConfig({
                          ...localConfig,
                          sampleRateHz: Math.max(parseFloat(event.target.value) || 0, 0),
                        })
                      }
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      FFT 频率轴优先使用这里的采样率；如果填写为 0，会按时间戳自动估算。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fftWindowSize">FFT 窗口大小</Label>
                    <Input
                      id="fftWindowSize"
                      type="number"
                      value={localConfig.fftWindowSize}
                      onChange={(event) =>
                        setLocalConfig({
                          ...localConfig,
                          fftWindowSize: Math.min(
                            Math.max(parseInt(event.target.value, 10) || 1024, 32),
                            4096
                          ),
                        })
                      }
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      窗口越大，频率分辨率越高，但实时性越低。常用范围建议 256 到 2048。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-border/60 p-4">
                <div className="mb-3 text-sm font-medium">显示选项</div>
                <div className="grid gap-3">
                  <ToggleRow
                    label="显示网格"
                    checked={localConfig.showGrid}
                    onCheckedChange={(checked) =>
                      setLocalConfig({ ...localConfig, showGrid: checked })
                    }
                  />
                  <ToggleRow
                    label="显示图例"
                    checked={localConfig.showLegend}
                    onCheckedChange={(checked) =>
                      setLocalConfig({ ...localConfig, showLegend: checked })
                    }
                  />
                  <ToggleRow
                    label="显示工具提示"
                    checked={localConfig.showTooltip}
                    onCheckedChange={(checked) =>
                      setLocalConfig({ ...localConfig, showTooltip: checked })
                    }
                  />
                  <ToggleRow
                    label="启用动画"
                    checked={localConfig.animationEnabled}
                    onCheckedChange={(checked) =>
                      setLocalConfig({ ...localConfig, animationEnabled: checked })
                    }
                  />
                </div>
              </div>

              <div className="rounded-[24px] border border-border/60 p-4">
                <div className="mb-3 text-sm font-medium">当前模式说明</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>波形示波器</strong>：适合实时调试数值流，支持 Time / FFT、缩放、拖拽与导出。</p>
                  <p><strong>FFT 快捷入口</strong>：RTT 和串口工具栏都可以直接点“波形 / FFT”，不必先进入图表内部切换。</p>
                  <p><strong>XY 散点图</strong>：适合 X/Y 关系曲线，例如角度-电流、速度-电压。</p>
                  <p><strong>自动模式</strong>：会优先尝试 JSON，再尝试正则与分隔符。</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="series" className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">数据系列</div>
                <p className="text-xs text-muted-foreground">控制每个字段的显示名称、颜色与可见性。</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleAddSeries}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加系列
              </Button>
            </div>

            <div className="space-y-3">
              {localConfig.series.map((series, index) => (
                <div key={`${series.key}-${index}`} className="grid gap-3 rounded-[24px] border border-border/60 p-4 md:grid-cols-[1fr_1fr_auto_auto_auto]">
                  <Input
                    value={series.key}
                    placeholder="数据键"
                    onChange={(event) => {
                      const next = [...localConfig.series];
                      next[index] = { ...next[index], key: event.target.value };
                      setLocalConfig({ ...localConfig, series: next });
                    }}
                  />
                  <Input
                    value={series.name}
                    placeholder="显示名称"
                    onChange={(event) => {
                      const next = [...localConfig.series];
                      next[index] = { ...next[index], name: event.target.value };
                      setLocalConfig({ ...localConfig, series: next });
                    }}
                  />
                  <Input
                    value={series.unit || ""}
                    placeholder="单位"
                    onChange={(event) => {
                      const next = [...localConfig.series];
                      next[index] = { ...next[index], unit: event.target.value };
                      setLocalConfig({ ...localConfig, series: next });
                    }}
                  />
                  <input
                    type="color"
                    value={series.color}
                    onChange={(event) => {
                      const next = [...localConfig.series];
                      next[index] = { ...next[index], color: event.target.value };
                      setLocalConfig({ ...localConfig, series: next });
                    }}
                    className="h-10 w-14 cursor-pointer rounded-xl border border-border bg-transparent"
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={series.visible}
                      onCheckedChange={(checked) => {
                        const next = [...localConfig.series];
                        next[index] = { ...next[index], visible: checked };
                        setLocalConfig({ ...localConfig, series: next });
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setLocalConfig({
                          ...localConfig,
                          series: localConfig.series.filter((_, itemIndex) => itemIndex !== index),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              {localConfig.series.length === 0 && (
                <div className="rounded-[24px] border border-dashed border-border/80 p-6 text-center text-sm text-muted-foreground">
                  还没有系列，先添加一项。
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="delimiter" className="space-y-4 pt-4">
            <div className="rounded-[24px] border border-border/60 p-4">
              <ToggleRow
                label="启用分隔符解析"
                checked={localConfig.delimiterEnabled}
                onCheckedChange={(checked) =>
                  setLocalConfig({ ...localConfig, delimiterEnabled: checked })
                }
              />
              <div className="mt-4 space-y-2">
                <Label htmlFor="delimiter">分隔符</Label>
                <Input
                  id="delimiter"
                  value={localConfig.delimiter}
                  placeholder=", / \\t / ;"
                  onChange={(event) =>
                    setLocalConfig({ ...localConfig, delimiter: event.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">字段映射</div>
                <p className="text-xs text-muted-foreground">例如 `1.23,4.56` 可映射成 voltage / current。</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleAddField}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加字段
              </Button>
            </div>

            <div className="space-y-3">
              {localConfig.fields.map((field, index) => (
                <div key={`${field.name}-${index}`} className="grid gap-3 rounded-[24px] border border-border/60 p-4 md:grid-cols-[100px_1fr_auto_auto]">
                  <Input
                    type="number"
                    value={field.index}
                    onChange={(event) => {
                      const next = [...localConfig.fields];
                      next[index] = {
                        ...next[index],
                        index: Math.max(parseInt(event.target.value, 10) || 0, 0),
                      };
                      setLocalConfig({ ...localConfig, fields: next });
                    }}
                  />
                  <Input
                    value={field.name}
                    onChange={(event) => {
                      const next = [...localConfig.fields];
                      next[index] = { ...next[index], name: event.target.value };
                      setLocalConfig({ ...localConfig, fields: next });
                    }}
                  />
                  <Switch
                    checked={field.enabled}
                    onCheckedChange={(checked) => {
                      const next = [...localConfig.fields];
                      next[index] = { ...next[index], enabled: checked };
                      setLocalConfig({ ...localConfig, fields: next });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setLocalConfig({
                        ...localConfig,
                        fields: localConfig.fields.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="regex" className="space-y-4 pt-4">
            <div className="rounded-[24px] border border-border/60 p-4">
              <ToggleRow
                label="启用正则解析"
                checked={localConfig.regexEnabled}
                onCheckedChange={(checked) =>
                  setLocalConfig({ ...localConfig, regexEnabled: checked })
                }
              />
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="regexPattern">正则表达式（推荐命名捕获组）</Label>
                  <Input
                    id="regexPattern"
                    value={localConfig.regexPattern}
                    placeholder="temp:(?<temp>\\d+\\.\\d+)"
                    className="font-mono"
                    onChange={(event) =>
                      setLocalConfig({ ...localConfig, regexPattern: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regexFlags">正则标志</Label>
                  <Input
                    id="regexFlags"
                    value={localConfig.regexFlags || ""}
                    placeholder="g / gi"
                    onChange={(event) =>
                      setLocalConfig({ ...localConfig, regexFlags: event.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="json" className="space-y-4 pt-4">
            <div className="rounded-[24px] border border-border/60 p-4">
              <ToggleRow
                label="启用 JSON 解析"
                checked={localConfig.jsonEnabled}
                onCheckedChange={(checked) =>
                  setLocalConfig({ ...localConfig, jsonEnabled: checked })
                }
              />
              <div className="mt-4 space-y-2">
                <Label htmlFor="jsonKeys">JSON 字段（逗号分隔，留空表示全部数值字段）</Label>
                <Input
                  id="jsonKeys"
                  value={(localConfig.jsonKeys || []).join(",")}
                  placeholder="voltage,current,temperature"
                  onChange={(event) =>
                    setLocalConfig({
                      ...localConfig,
                      jsonKeys: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存配置</Button>
        </div>
      </DialogContent>
    </Dialog>
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
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
