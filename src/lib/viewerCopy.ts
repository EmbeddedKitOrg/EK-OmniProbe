// src/lib/viewerCopy.ts
// 日志/串口虚拟列表视图的复制工具：
//  - 行格式化（与界面显示保持一致）
//  - 写剪贴板
//  - useViewerSelection：解决虚拟滚动下"拖拽多选丢内容""Ctrl+A 选到页面其它区域"的问题
//
// 背景：RttViewer / SerialViewer 用 @tanstack/react-virtual，滚出可视区的行会被卸载，
// 浏览器原生选区只能拿到 DOM 里还存在的节点。所以选区/全选都改成按"行号区间"
// 从数据数组重建文本，彻底绕开虚拟化。

import { useCallback, useEffect, useRef, useState } from "react";
import type { RttLine } from "./types";
import type { SerialLine } from "./serialTypes";
import { DEFAULT_TIMESTAMP_FORMAT, formatTime, formatTimestamp } from "./formatters";

export type CopyLog = (level: "info" | "warn", message: string) => void;

export function formatDataAsHex(data: number[] | undefined, text: string): string {
  const bytes = data?.length ? data : Array.from(new TextEncoder().encode(text));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

/** 按界面显示样式把 RTT 行转成可复制文本 */
export function formatRttLineForCopy(line: RttLine, showTimestamp: boolean): string {
  const ts = showTimestamp ? `[${formatTime(line.timestamp.getTime())}] ` : "";
  return `${ts}[${line.channel}] ${line.text}`;
}

/** 按界面显示样式把串口行转成可复制文本 */
export function formatSerialLineForCopy(
  line: SerialLine,
  showTimestamp: boolean,
  showDirectionPrefix: boolean,
  timestampFormat = DEFAULT_TIMESTAMP_FORMAT
): string {
  const ts = showTimestamp ? `[${formatTimestamp(line.timestamp.getTime(), timestampFormat)}] ` : "";
  const dir = showDirectionPrefix ? (line.direction === "rx" ? "【RX】 " : "【TX】 ") : "";
  return `${ts}${dir}${line.text}`;
}

/** 写剪贴板并打日志；text 为空时静默返回 false */
export function copyTextToClipboard(text: string, label: string, log?: CopyLog): boolean {
  if (!text) {
    log?.("warn", "没有可复制的内容");
    return false;
  }

  let copied = false;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    copied = true;
  };
  document.addEventListener("copy", onCopy, { once: true });
  try {
    document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.removeEventListener("copy", onCopy);
  }
  if (copied) {
    log?.("info", `已复制${label}（${text.split("\n").length} 行）`);
    return true;
  }

  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).then(
      () => log?.("info", `已复制${label}（${text.split("\n").length} 行）`),
      (err) => log?.("warn", `复制到剪贴板失败: ${err}`)
    );
    return true;
  }

  log?.("warn", "当前环境不支持写入剪贴板");
  return false;
}

/** 从数据数组复制全部行（供工具栏「复制全部」按钮调用，不依赖 DOM） */
export function copyAllLines<T>(lines: T[], formatLine: (line: T) => string, log?: CopyLog): boolean {
  return copyTextToClipboard(lines.map(formatLine).join("\n"), "全部", log);
}

export interface SelectedRange {
  start: number;
  end: number;
}

/** 从 DOM 节点向上找最近的 data-line-index / data-index */
function findLineIndex(node: Node | null, container: HTMLElement): number | null {
  let el: HTMLElement | null =
    node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node?.parentElement ?? null);
  while (el && el !== container) {
    const v = el.getAttribute?.("data-line-index") ?? el.getAttribute?.("data-index");
    if (v != null) return Number(v);
    el = el.parentElement;
  }
  return null;
}

function isEditableTarget(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

/**
 * 给虚拟列表视图提供"按行号"的选区能力：
 *  - 在容器上挂 ref（scrollRef）
 *  - 拖拽期间记录起止行号（mousedown→mousemove），即使中途滚动、行被卸载也不丢
 *  - highlight：跨行拖拽 / 全选时返回行号区间，供视图自绘高亮（不依赖原生选区，
 *    滚动卸载也不掉色）；单行选择返回 null，把字符级高亮留给原生选区
 *  - Ctrl+A：仅当鼠标在该视图内时拦截，标记"全选"并高亮整段
 *  - getSelectedRange()：全选 → 整段；拖拽 → 起止区间；否则回退到当前 DOM 选区
 *
 * 不接管 Ctrl+C —— 由各 viewer 自己处理（串口有 RX/TX 等多种复制模式）。
 */
export function useViewerSelection(lineCount: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const dragEnd = useRef<number | null>(null);
  const selectAll = useRef(false);
  const lineCountRef = useRef(lineCount);
  lineCountRef.current = lineCount;

  // 供渲染用的高亮区间：仅跨行拖拽 / 全选时非空；单行交给原生选区做字符级高亮。
  // 用 ref 镜像一份，避免在事件回调里重复 setState 触发无谓重渲染。
  const [highlight, setHighlightState] = useState<SelectedRange | null>(null);
  const highlightRef = useRef<SelectedRange | null>(null);
  const setHighlight = useCallback((r: SelectedRange | null) => {
    const cur = highlightRef.current;
    if (cur?.start === r?.start && cur?.end === r?.end) return;
    highlightRef.current = r;
    setHighlightState(r);
  }, []);

  // 拖拽追踪
  useEffect(() => {
    const c = scrollRef.current;
    if (!c) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      selectAll.current = false;
      const i = findLineIndex(e.target as Node, c);
      dragStart.current = i;
      dragEnd.current = i;
      setHighlight(null); // 新一次按下先清旧高亮，让原生选区从头开始
    };
    const onDocumentDown = (e: MouseEvent) => {
      if (e.button !== 0 || c.contains(e.target as Node)) return;
      selectAll.current = false;
      dragStart.current = null;
      dragEnd.current = null;
      setHighlight(null);
    };
    const onMove = (e: MouseEvent) => {
      if (dragStart.current == null || (e.buttons & 1) === 0) return;
      const i = findLineIndex(e.target as Node, c);
      if (i == null) return;
      dragEnd.current = i;
      const start = Math.min(dragStart.current, i);
      const end = Math.max(dragStart.current, i);
      // 单行不画行级高亮（避免和原生半行选区冲突）；跨行才接管
      setHighlight(start === end ? null : { start, end });
    };
    c.addEventListener("mousedown", onDown);
    c.addEventListener("mousemove", onMove);
    document.addEventListener("mousedown", onDocumentDown);
    return () => {
      c.removeEventListener("mousedown", onDown);
      c.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDocumentDown);
    };
  }, [setHighlight]);

  // 容器内才算"命中"：鼠标悬停 / 选区落在容器内
  const isInside = useCallback(() => {
    const c = scrollRef.current;
    if (!c) return false;
    if (c.matches(":hover")) return true;
    const sel = window.getSelection();
    return !!(sel && sel.anchorNode && c.contains(sel.anchorNode));
  }, []);

  // 限定在本视图内的 Ctrl+A
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a")) return;
      if (isEditableTarget() || !isInside()) return;
      const c = scrollRef.current;
      if (!c) return;
      e.preventDefault();
      selectAll.current = true;
      dragStart.current = null;
      dragEnd.current = null;
      // 行级高亮整段（不依赖虚拟化下的 DOM 原生选区）
      window.getSelection()?.removeAllRanges();
      const count = lineCountRef.current;
      setHighlight(count > 0 ? { start: 0, end: count - 1 } : null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isInside, setHighlight]);

  const getSelectedRange = useCallback((): SelectedRange | null => {
    const count = lineCountRef.current;
    if (selectAll.current) {
      return count > 0 ? { start: 0, end: count - 1 } : null;
    }
    const a = dragStart.current;
    const b = dragEnd.current;
    if (a != null && b != null) {
      return { start: Math.min(a, b), end: Math.max(a, b) };
    }
    // 回退：当前 DOM 选区（仅适用于未滚动、全在可视区的小范围选择）
    const c = scrollRef.current;
    const sel = window.getSelection();
    if (!c || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!c.contains(range.startContainer) || !c.contains(range.endContainer)) return null;
    const s = findLineIndex(range.startContainer, c);
    const en = findLineIndex(range.endContainer, c);
    if (s == null || en == null) return null;
    return { start: Math.min(s, en), end: Math.max(s, en) };
  }, []);

  const isSelectAll = useCallback(() => selectAll.current, []);

  return { scrollRef, getSelectedRange, isSelectAll, highlight };
}
