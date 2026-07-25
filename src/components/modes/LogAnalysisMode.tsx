import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Columns2, FileText, FileUp, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SerialViewer } from "@/components/serial/SerialViewer";
import { ChartViewer } from "@/components/rtt/ChartViewer";
import { ChartConfigDialog } from "@/components/rtt/ChartConfigDialog";
import type { SerialLine } from "@/lib/serialTypes";
import type { ChartDataPoint, ViewMode } from "@/lib/chartTypes";
import { DEFAULT_CHART_CONFIG, migrateChartConfig } from "@/lib/chartTypes";
import { parseChartLines } from "@/lib/parseChartData";
import { streamLogLines } from "@/lib/logImport";
import { formatBytes } from "@/lib/formatters";
import { parseLogLevel } from "@/lib/utils";
import { cn } from "@/lib/utils";

const CHART_PARSE_BATCH_SIZE = 5_000;

export function LogAnalysisMode() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importRunRef = useRef(0);
  const chartRunRef = useRef(0);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [lines, setLines] = useState<SerialLine[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [inferredTimestampCount, setInferredTimestampCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("text");
  const [chartConfig, setChartConfig] = useState(() => migrateChartConfig(DEFAULT_CHART_CONFIG));
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartPaused, setChartPaused] = useState(false);
  const [chartParsing, setChartParsing] = useState(false);
  const [chartProgress, setChartProgress] = useState(0);
  const [parseSuccessCount, setParseSuccessCount] = useState(0);
  const [parseFailCount, setParseFailCount] = useState(0);

  const samples = useMemo(() => lines.slice(0, 200).map((line) => ({ text: line.text })), [lines]);
  const viewerData = useMemo(
    () => ({
      autoScroll: false,
      showTimestamp: true,
      timestampFormat: "YYYY-MM-DD HH:mm:ss.SSS",
      showDirectionPrefix: false,
      running: true,
      displayMode: "text" as const,
      connected: true,
      lines,
      searchQuery,
    }),
    [lines, searchQuery]
  );

  const clear = () => {
    importRunRef.current += 1;
    chartRunRef.current += 1;
    setFileName("");
    setFileSize(0);
    setLines([]);
    setImportedCount(0);
    setInferredTimestampCount(0);
    setImporting(false);
    setImportError("");
    setSearchQuery("");
    setChartData([]);
    setChartParsing(false);
    setChartProgress(0);
    setParseSuccessCount(0);
    setParseFailCount(0);
  };

  const importFile = async (file: File) => {
    const runId = ++importRunRef.current;
    const importedLines: SerialLine[] = [];
    let inferred = 0;

    setFileName(file.name);
    setFileSize(file.size);
    setLines([]);
    setImportedCount(0);
    setInferredTimestampCount(0);
    setImportError("");
    setImporting(true);

    try {
      for await (const batch of streamLogLines(file)) {
        if (runId !== importRunRef.current) return;
        for (const line of batch) {
          importedLines.push({
            id: line.lineNumber,
            timestamp: new Date(line.timestamp),
            text: line.text,
            level: parseLogLevel(line.text),
            direction: "rx",
          });
          if (line.timestampInferred) inferred += 1;
        }
        setImportedCount(importedLines.length);
        setInferredTimestampCount(inferred);
      }

      if (runId === importRunRef.current) setLines(importedLines);
    } catch (error) {
      if (runId === importRunRef.current) setImportError(String(error));
    } finally {
      if (runId === importRunRef.current) setImporting(false);
    }
  };

  useEffect(() => {
    const runId = ++chartRunRef.current;
    if (!chartConfig.enabled || lines.length === 0) {
      setChartData([]);
      setChartParsing(false);
      setChartProgress(0);
      setParseSuccessCount(0);
      setParseFailCount(0);
      return;
    }

    const parse = async () => {
      const points: ChartDataPoint[] = [];
      let success = 0;
      let fail = 0;
      setChartParsing(true);
      setChartProgress(0);

      for (let offset = 0; offset < lines.length; offset += CHART_PARSE_BATCH_SIZE) {
        if (runId !== chartRunRef.current) return;
        const parsed = parseChartLines(lines.slice(offset, offset + CHART_PARSE_BATCH_SIZE), chartConfig);
        points.push(...parsed.points);
        success += parsed.success;
        fail += parsed.fail;
        if (points.length > chartConfig.maxDataPoints) points.splice(0, points.length - chartConfig.maxDataPoints);
        setChartProgress(Math.min(100, Math.round(((offset + CHART_PARSE_BATCH_SIZE) / lines.length) * 100)));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      if (runId === chartRunRef.current) {
        setChartData(points);
        setParseSuccessCount(success);
        setParseFailCount(fail);
        setChartParsing(false);
        setChartProgress(100);
      }
    };

    void parse();
    return () => {
      if (chartRunRef.current === runId) chartRunRef.current += 1;
    };
  }, [chartConfig, lines]);

  const hasText = viewMode !== "chart";
  const hasChart = viewMode !== "text";

  return (
    <div className="surface-strong flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-[14px] p-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".log,.txt,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void importFile(file);
        }}
      />

      <div className="surface-card flex shrink-0 flex-wrap items-center gap-2 rounded-[18px] px-3 py-2">
        <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {fileName ? "重新导入" : "导入日志"}
        </Button>

        <div className="relative min-w-52 flex-1 md:max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-shortcut-search
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索日志内容"
            className="h-8 pl-8"
            disabled={lines.length === 0}
          />
        </div>

        <div className="flex items-center rounded-lg border border-border/60 p-0.5">
          {(
            [
              ["text", FileText, "文本"],
              ["split", Columns2, "分屏"],
              ["chart", BarChart3, "图表"],
            ] as const
          ).map(([mode, Icon, label]) => (
            <Button
              key={mode}
              size="sm"
              variant={viewMode === mode ? "secondary" : "ghost"}
              className="h-7 gap-1 px-2"
              onClick={() => setViewMode(mode)}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>

        <ChartConfigDialog
          chartConfig={chartConfig}
          setChartConfig={(config) => setChartConfig(migrateChartConfig(config))}
          samples={samples}
          title="日志解析与图表配置"
          allowParserConfig
          trigger={
            <Button size="sm" variant="outline" disabled={lines.length === 0}>
              解析配置
            </Button>
          }
        />

        <Button size="sm" variant="ghost" className="gap-1" onClick={clear} disabled={!fileName && !importing}>
          <Trash2 className="h-4 w-4" />
          清空
        </Button>
      </div>

      <div className="flex min-h-5 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground">
        {fileName ? (
          <>
            <span className="max-w-80 truncate" title={fileName}>
              {fileName}
            </span>
            <span>{formatBytes(fileSize)}</span>
            <span>{importedCount.toLocaleString()} 行</span>
            {inferredTimestampCount > 0 && <span className="text-amber-600">{inferredTimestampCount} 行时间为推断值</span>}
            {chartParsing && <span>图表解析 {chartProgress}%</span>}
          </>
        ) : (
          <span>支持 UTF-8 的 .log / .txt 文件，按流读取大文件。</span>
        )}
        {importError && <span className="text-red-500">导入失败：{importError}</span>}
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-2 overflow-hidden",
          hasText && hasChart ? "grid-rows-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-rows-1"
        )}
      >
        {lines.length === 0 && !importing ? (
          <button
            type="button"
            className="flex h-full min-h-64 flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-border/70 bg-muted/20 text-muted-foreground"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="h-8 w-8" />
            <span className="text-sm">选择日志文件开始分析</span>
          </button>
        ) : importing ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            正在流式导入 {importedCount.toLocaleString()} 行…
          </div>
        ) : (
          <>
            {hasText && (
              <div className="min-h-0 overflow-hidden rounded-[22px] border border-border/60 bg-background">
                <SerialViewer title="日志" data={viewerData} />
              </div>
            )}
            {hasChart && (
              <div className="min-h-0 overflow-hidden rounded-[22px] border border-border/60 bg-background">
                <ChartViewer
                  chartData={chartData}
                  chartConfig={chartConfig}
                  chartPaused={chartPaused}
                  parseSuccessCount={parseSuccessCount}
                  parseFailCount={parseFailCount}
                  setChartPaused={setChartPaused}
                  clearChartData={() => {
                    setChartData([]);
                    setParseSuccessCount(0);
                    setParseFailCount(0);
                  }}
                  setChartConfig={(config) => setChartConfig(migrateChartConfig(config))}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
