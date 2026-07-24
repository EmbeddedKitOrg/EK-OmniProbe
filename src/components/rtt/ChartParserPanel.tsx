import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { AlertCircle, CheckCircle2, ChevronLeft, CircleHelp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ChartConfig, ParseMode } from "@/lib/chartTypes";
import { populateEmptyChannelsFromSamples, type ChartSample } from "@/lib/chartAutoConfig";
import { parseChartData } from "@/lib/parseChartData";

const DATA_FORMAT_DOC_URL = "https://embeddedkitorg.github.io/EK-OmniProbe/#/DATA_FORMAT_GUIDE";

interface ChartParserPanelProps {
  chartConfig: ChartConfig;
  samples: ChartSample[];
  allowJustFloat?: boolean;
  setChartConfig: (config: ChartConfig) => void;
  onClose: () => void;
}

export function ChartParserPanel({
  chartConfig,
  samples,
  allowJustFloat = false,
  setChartConfig,
  onClose,
}: ChartParserPanelProps) {
  const [parseMode, setParseMode] = useState(chartConfig.parseMode);
  const [delimiter, setDelimiter] = useState(chartConfig.delimiter);
  const [regexPattern, setRegexPattern] = useState(chartConfig.regexPattern);
  const [regexFlags, setRegexFlags] = useState(chartConfig.regexFlags ?? "");
  const latestSample = samples[samples.length - 1];
  const [sampleText, setSampleText] = useState(latestSample?.text ?? "");

  const preview = useMemo(() => {
    const sample = { text: sampleText, rawData: latestSample?.rawData };
    const baseConfig: ChartConfig = {
      ...chartConfig,
      enabled: true,
      parseMode,
      delimiter,
      regexPattern,
      regexFlags,
      channels: [],
    };
    const inferredConfig = populateEmptyChannelsFromSamples(
      baseConfig,
      parseMode === "justfloat" ? samples : sampleText ? [sample] : samples
    );

    if (parseMode === "justfloat") {
      return {
        config: inferredConfig,
        success: inferredConfig.channels.length > 0,
        values: {},
        message:
          inferredConfig.channels.length > 0
            ? `识别到 ${inferredConfig.channels.length} 个浮点通道`
            : "等待完整 JustFloat 数据帧",
      };
    }

    const result = sampleText ? parseChartData(sampleText, inferredConfig) : undefined;
    return {
      config: inferredConfig,
      success: Boolean(result?.success),
      values: result?.dataPoint?.values ?? {},
      message: result?.success
        ? `识别到 ${Object.keys(result.dataPoint?.values ?? {}).length} 个数值通道`
        : (result?.error ?? "暂无可预览的数据"),
    };
  }, [chartConfig, delimiter, latestSample?.rawData, parseMode, regexFlags, regexPattern, sampleText, samples]);

  const apply = () => {
    const parserChanged = parseMode !== chartConfig.parseMode;
    setChartConfig({
      ...chartConfig,
      enabled: true,
      parseMode,
      delimiter: parseMode === "auto" ? preview.config.delimiter : delimiter,
      regexPattern,
      regexFlags,
      channels: parserChanged
        ? preview.config.channels
        : chartConfig.channels.length === 0 && preview.config.channels.length > 0
          ? preview.config.channels
          : chartConfig.channels,
    });
    onClose();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={onClose} title="返回通道列表">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">数据解析</div>
          <div className="text-xs text-muted-foreground">按当前串口样本预览解析结果</div>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" title="查看输入格式参考">
              <CircleHelp className="h-4 w-4" />
              <span className="sr-only">查看输入格式参考</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
            <div>
              <div className="text-sm font-semibold">输入格式参考</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                每行数据会先解析为数值通道；预览里的字段名就是组件需要绑定的通道 key。
              </p>
            </div>
            <div className="space-y-2 text-xs">
              {[
                ["JSON", '{"temp":25.3,"voltage":3.3}'],
                ["KV", "temp=25.3,voltage=3.3"],
                ["分隔符", "25.3,3.3"],
                ["正则", "temp:(?<temp>-?\\d+(?:\\.\\d+)?)"],
                ["JustFloat", "little-endian float32 + 00 00 80 7F"],
              ].map(([label, example]) => (
                <div key={label}>
                  <div className="mb-1 font-medium text-muted-foreground">{label}</div>
                  <code className="block overflow-x-auto rounded-lg bg-muted px-2 py-1.5 font-mono text-[11px]">
                    {example}
                  </code>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-2"
              onClick={() =>
                void open(`${DATA_FORMAT_DOC_URL}?id=${parseMode}`).catch((error) =>
                  console.error("打开数据格式文档失败:", error)
                )
              }
            >
              查看完整文档
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-2">
          <Label>解析模式</Label>
          <Select value={parseMode} onValueChange={(value: ParseMode) => setParseMode(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动识别</SelectItem>
              <SelectItem value="delimiter">分隔符</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="kv">KV (key=value)</SelectItem>
              <SelectItem value="regex">正则表达式</SelectItem>
              {allowJustFloat && <SelectItem value="justfloat">JustFloat / VOFA RawData</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {parseMode === "delimiter" && (
          <div className="space-y-2">
            <Label htmlFor="parser-delimiter">分隔符</Label>
            <Input
              id="parser-delimiter"
              value={delimiter}
              onChange={(event) => setDelimiter(event.target.value)}
              placeholder=", / \t / ; / 空格"
              className="font-mono"
            />
          </div>
        )}

        {parseMode === "regex" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="parser-regex">正则表达式</Label>
              <Input
                id="parser-regex"
                value={regexPattern}
                onChange={(event) => setRegexPattern(event.target.value)}
                placeholder="temp:(?<temp>\\d+\\.\\d+)"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parser-flags">标志</Label>
              <Input
                id="parser-flags"
                value={regexFlags}
                onChange={(event) => setRegexFlags(event.target.value)}
                placeholder="g / gi"
              />
            </div>
          </div>
        )}

        {parseMode !== "justfloat" && (
          <div className="space-y-2">
            <Label htmlFor="parser-sample">数据样本</Label>
            <textarea
              id="parser-sample"
              value={sampleText}
              onChange={(event) => setSampleText(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-[14px] border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              placeholder="接收串口数据后会自动填入最近一条 RX 样本"
            />
          </div>
        )}

        <div
          className={`rounded-[16px] border p-3 ${preview.success ? "border-green-500/25 bg-green-500/10" : "border-amber-500/25 bg-amber-500/10"}`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {preview.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-600" />
            )}
            {preview.message}
          </div>
          {Object.keys(preview.values).length > 0 && (
            <div className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
              {Object.entries(preview.values).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <span>{key}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border/60 p-3">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button onClick={apply}>应用解析</Button>
      </div>
    </div>
  );
}
