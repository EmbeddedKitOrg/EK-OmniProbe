// src/lib/viewerCopy.ts
// 日志/串口虚拟列表视图的复制工具：
//  - 行格式化（与界面显示保持一致）
//  - 写剪贴板
//  - useViewerSelection：解决虚拟滚动下"拖拽多选丢内容""Ctrl+A 选到页面其它区域"的问题
//
// 背景：RttViewer / SerialViewer 用 @tanstack/react-virtual，滚出可视区的行会被卸载，
// 浏览器原生选区只能拿到 DOM 里还存在的节点。所以选区/全选都改成按"行号区间"
// 从数据数组重建文本，彻底绕开虚拟化。

import { useCallback, useEffect, useRef } from "react";
import type { RttLine } from "./types";
import type { SerialLine } from "./serialTypes";
import { formatTime } from "./formatters";

export type CopyLog = (level: "info" | "warn", message: string) => void;

/** 按界面显示样式把 RTT 行转成可复制文本 */
export function formatRttLineForCopy(line: RttLine, showTimestamp: boolean): string {
  const ts = showTimestamp ? `[${formatTime(line.timestamp.getTime())}] ` : "";
  return `${ts}[${line.channel}] ${line.text}`;
}

/** 按界面显示样式把串口行转成可复制文本 */
export function formatSerialLineForCopy(
  line: SerialLine,
  showTimestamp: boolean,
  showDirectionPrefix: boolean
): string {
  const ts = showTimestamp ? `[${formatTime(line.timestamp.getTime())}] ` : "";
  const dir = showDirectionPrefix ? (line.direction === "rx" ? "【RX】 " : "【TX】 ") : "";
  return `${ts}${dir}${line.text}`;
}

/** 写剪贴板并打日志；text 为空时静默返回 false */
export function copyTextToClipboard(text: string, label: string, log?: CopyLog): boolean {
  if (!text) {
    log?.("warn", "没有可复制的内容");
    return false;
  }
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch((err) => log?.("warn", `复制到剪贴板失败: ${err}`));
  }
  log?.("info", `已复制${label}（${text.split("\n").length} 行）`);
  return true;
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
 *  - Ctrl+A：仅当鼠标在该视图内时拦截，标记"全选"，并对 DOM 内可见行做视觉高亮
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
    };
    const onMove = (e: MouseEvent) => {
      if (dragStart.current == null || (e.buttons & 1) === 0) return;
      const i = findLineIndex(e.target as Node, c);
      if (i != null) dragEnd.current = i;
    };
    c.addEventListener("mousedown", onDown);
    c.addEventListener("mousemove", onMove);
    return () => {
      c.removeEventListener("mousedown", onDown);
      c.removeEventListener("mousemove", onMove);
    };
  }, []);

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
      // 视觉反馈：高亮 DOM 内已渲染的行（虚拟化下只是部分高亮，可接受）
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const r = document.createRange();
        r.selectNodeContents(c);
        sel.addRange(r);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isInside]);

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

  return { scrollRef, getSelectedRange, isSelectAll };
}
