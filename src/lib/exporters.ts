// src/lib/exporters.ts
// 通用数据导出工具：保存对话框 + 写文件 + 各类数据序列化

import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { LogEntry, RttLine } from "./types";
import type { SerialLine } from "./serialTypes";
import type { ChartConfig, ChartDataPoint } from "./chartTypes";
import { formatTime } from "./formatters";

interface DialogFilter {
  name: string;
  extensions: string[];
}

const TEXT_FILTERS: DialogFilter[] = [{ name: "文本文件", extensions: ["txt"] }];
const CSV_FILTERS: DialogFilter[] = [{ name: "CSV", extensions: ["csv"] }];
const PNG_FILTERS: DialogFilter[] = [{ name: "PNG 图片", extensions: ["png"] }];

async function saveTextFile(
  content: string,
  defaultName: string,
  filters: DialogFilter[]
): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters });
  if (!path) return null;
  await invoke("write_text_file", { path, content });
  return path;
}

async function saveBinaryFile(
  base64Content: string,
  defaultName: string,
  filters: DialogFilter[]
): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters });
  if (!path) return null;
  await invoke("write_binary_file", { path, contentBase64: base64Content });
  return path;
}

function timestampSuffix(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============ 日志面板 ============

export async function exportLogs(logs: LogEntry[]): Promise<string | null> {
  const content = logs
    .map((log) => `[${formatTime(log.timestamp.getTime())}] [${log.level.toUpperCase()}] ${log.message}`)
    .join("\n");
  return saveTextFile(content, `omniprobe-logs-${timestampSuffix()}.txt`, TEXT_FILTERS);
}

// ============ RTT ============

export async function exportRttLinesAsTxt(lines: RttLine[]): Promise<string | null> {
  const content = lines
    .map((line) => `[${formatTime(line.timestamp.getTime())}] [CH${line.channel}] ${line.text}`)
    .join("\n");
  return saveTextFile(content, `rtt-${timestampSuffix()}.txt`, TEXT_FILTERS);
}

export async function exportRttLinesAsCsv(lines: RttLine[]): Promise<string | null> {
  const header = "timestamp,channel,level,text";
  const rows = lines.map((line) =>
    [
      escapeCsv(line.timestamp.toISOString()),
      String(line.channel),
      escapeCsv(line.level),
      escapeCsv(line.text),
    ].join(",")
  );
  const content = [header, ...rows].join("\n");
  return saveTextFile(content, `rtt-${timestampSuffix()}.csv`, CSV_FILTERS);
}

// ============ Serial ============

export async function exportSerialLinesAsTxt(lines: SerialLine[]): Promise<string | null> {
  const content = lines
    .map((line) => {
      const dir = line.direction === "tx" ? ">>" : "<<";
      return `[${formatTime(line.timestamp.getTime())}] ${dir} ${line.text}`;
    })
    .join("\n");
  return saveTextFile(content, `serial-${timestampSuffix()}.txt`, TEXT_FILTERS);
}

export async function exportSerialLinesAsCsv(lines: SerialLine[]): Promise<string | null> {
  const header = "timestamp,direction,text";
  const rows = lines.map((line) =>
    [
      escapeCsv(line.timestamp.toISOString()),
      line.direction,
      escapeCsv(line.text),
    ].join(",")
  );
  const content = [header, ...rows].join("\n");
  return saveTextFile(content, `serial-${timestampSuffix()}.csv`, CSV_FILTERS);
}

// ============ Chart ============

export async function exportChartDataAsCsv(
  data: ChartDataPoint[],
  config: ChartConfig
): Promise<string | null> {
  const seriesKeys = config.series.map((s) => s.key);
  const seriesNames = config.series.map((s) => s.name || s.key);

  const header = ["timestamp", ...seriesNames.map(escapeCsv)].join(",");
  const rows = data.map((point) => {
    const cells = [escapeCsv(new Date(point.timestamp).toISOString())];
    for (const key of seriesKeys) {
      const value = point.values[key];
      cells.push(value === undefined || !Number.isFinite(value) ? "" : String(value));
    }
    return cells.join(",");
  });

  const content = [header, ...rows].join("\n");
  return saveTextFile(content, `chart-${timestampSuffix()}.csv`, CSV_FILTERS);
}

/**
 * 把 canvas 元素导出为 PNG 文件。
 * 适用于 SignalPlotCanvas 这类 <canvas> 渲染的图表。
 */
export async function exportCanvasAsPng(canvas: HTMLCanvasElement): Promise<string | null> {
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return saveBinaryFile(base64, `chart-${timestampSuffix()}.png`, PNG_FILTERS);
}

/**
 * 把 SVG 元素 (Recharts 渲染的) 转为 PNG。
 * 通过临时 canvas 绘制 svg blob 实现。
 */
export async function exportSvgAsPng(
  svg: SVGSVGElement,
  width: number,
  height: number,
  backgroundColor = "#ffffff"
): Promise<string | null> {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("无法创建 2D 上下文");
    }
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    return await exportCanvasAsPng(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
