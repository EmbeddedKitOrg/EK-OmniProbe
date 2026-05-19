import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSerialStore } from "@/stores/serialStore";
import { useLogStore } from "@/stores/logStore";
import { cn } from "@/lib/utils";
import type { SerialLine } from "@/lib/serialTypes";
import { parseColoredText } from "@/lib/rttColorParser";
import { parseAnsiText } from "@/lib/ansiParser";
import { useViewerSelection, formatSerialLineForCopy } from "@/lib/viewerCopy";

interface SerialViewerProps {
  direction?: "rx" | "tx";
  title?: string;
}

type CopyMode = "plain" | "with-timestamp" | "full";

// CopyMode → 是否带时间戳 / 方向前缀
const COPY_MODE_OPTS: Record<CopyMode, { ts: boolean; dir: boolean; label: string }> = {
  plain: { ts: false, dir: false, label: "纯文本" },
  "with-timestamp": { ts: true, dir: false, label: "含时间戳" },
  full: { ts: true, dir: true, label: "完整行" },
};

const formatLineForCopy = (line: SerialLine, mode: CopyMode): string => {
  const o = COPY_MODE_OPTS[mode];
  return formatSerialLineForCopy(line, o.ts, o.dir);
};

export function SerialViewer({ direction, title }: SerialViewerProps) {
  const { autoScroll, showTimestamp, showDirectionPrefix, running, displayMode, connected, lines, searchQuery } =
    useSerialStore();
  const addLog = useLogStore((state) => state.addLog);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Filter lines - cached with useMemo to avoid infinite loops
  const filteredLines = useMemo(() => {
    let filtered = lines;

    // Filter by direction if specified
    if (direction) {
      filtered = filtered.filter((line) => line.direction === direction);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((line) => line.text.toLowerCase().includes(query));
    }

    return filtered;
  }, [lines, direction, searchQuery]);

  const { scrollRef, getSelectedRange, isSelectAll } = useViewerSelection(filteredLines.length);

  const rowVirtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 22,
    overscan: 15,
  });

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScroll && filteredLines.length > 0) {
      rowVirtualizer.scrollToIndex(filteredLines.length - 1, { align: "end" });
    }
  }, [filteredLines.length, autoScroll, rowVirtualizer]);

  const writeToClipboard = useCallback(
    (text: string, label: string) => {
      if (!text) return;
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).catch((err) => {
          addLog("warn", `复制到剪贴板失败: ${err}`);
        });
      }
      addLog("info", `已复制 ${label}（${text.split("\n").length} 行）`);
    },
    [addLog]
  );

  const copySelection = useCallback(
    (mode: CopyMode) => {
      const range = getSelectedRange();
      const sel = window.getSelection();
      const rawText = sel ? sel.toString() : "";

      // 纯文本 + 单行选区 + 非全选：保留精确的字符级选区（行内半句）
      if (mode === "plain" && rawText && !isSelectAll() && range && range.start === range.end) {
        writeToClipboard(rawText, "纯文本");
        return true;
      }

      // 其余一律按行号区间从数据数组重建，绕开虚拟滚动的 DOM 截断
      if (!range) {
        if (mode === "plain" && rawText) {
          writeToClipboard(rawText, "纯文本");
          return true;
        }
        return false;
      }
      const slice = filteredLines.slice(range.start, range.end + 1);
      if (slice.length === 0) return false;
      const text = slice.map((line) => formatLineForCopy(line, mode)).join("\n");
      writeToClipboard(text, COPY_MODE_OPTS[mode].label);
      return true;
    },
    [filteredLines, writeToClipboard, getSelectedRange, isSelectAll]
  );

  // Ctrl+C 纯文本 / Ctrl+Shift+C 完整行（均按行号区间重建，跨滚动不丢）
  useEffect(() => {
    const isInside = () => {
      const c = scrollRef.current;
      if (!c) return false;
      if (isSelectAll() || c.matches(":hover")) return true;
      const sel = window.getSelection();
      return !!(sel && sel.anchorNode && c.contains(sel.anchorNode));
    };
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.key.toLowerCase() === "c")) return;
      if (event.altKey) return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (!isInside()) return;
      if (copySelection(event.shiftKey ? "full" : "plain")) {
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [copySelection, scrollRef, isSelectAll]);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().length === 0) {
      // 无选区时让浏览器原生菜单出现
      return;
    }
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // 点击外部 / 滚动 / Esc 关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = () => closeContextMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu, closeContextMenu]);

  // Empty state message based on direction
  const getEmptyMessage = () => {
    if (!connected) {
      return "请在左侧连接串口";
    }
    if (!running) {
      return "点击「开始」接收串口数据";
    }
    if (direction === "rx") {
      return "等待接收数据...";
    }
    if (direction === "tx") {
      return "暂无发送数据";
    }
    return "等待数据...";
  };

  // Empty state
  if (filteredLines.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {title && (
          <div className="px-2 py-1 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
            {title}
          </div>
        )}
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">{getEmptyMessage()}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {title && (
        <div className="px-2 py-1 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
          {title} ({filteredLines.length})
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-xs leading-5 p-2 bg-background"
        onContextMenu={handleContextMenu}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const line = filteredLines[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                data-line-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <SerialLineItem
                  line={line}
                  showTimestamp={showTimestamp}
                  showDirectionPrefix={showDirectionPrefix}
                  displayMode={displayMode}
                />
              </div>
            );
          })}
        </div>
      </div>
      {contextMenu && (
        <CopyContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onPick={(mode) => {
            copySelection(mode);
            closeContextMenu();
          }}
        />
      )}
    </div>
  );
}

interface CopyContextMenuProps {
  x: number;
  y: number;
  onPick: (mode: CopyMode) => void;
}

function CopyContextMenu({ x, y, onPick }: CopyContextMenuProps) {
  const items: Array<{ mode: CopyMode; label: string; hint?: string }> = [
    { mode: "plain", label: "复制（纯文本）", hint: "Ctrl+C" },
    { mode: "with-timestamp", label: "复制（含时间戳）" },
    { mode: "full", label: "复制（含时间戳 + RX/TX）", hint: "Ctrl+Shift+C" },
  ];
  return (
    <div
      role="menu"
      className="fixed z-50 min-w-[220px] rounded-md border border-border bg-popover py-1 text-sm shadow-md"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.mode}
          type="button"
          role="menuitem"
          className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left hover:bg-muted"
          onClick={() => onPick(item.mode)}
        >
          <span>{item.label}</span>
          {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}

interface SerialLineItemProps {
  line: SerialLine;
  showTimestamp: boolean;
  showDirectionPrefix: boolean;
  displayMode: "text" | "hex";
}

const SerialLineItem = React.memo(function SerialLineItem({
  line,
  showTimestamp,
  showDirectionPrefix,
  displayMode,
}: SerialLineItemProps) {
  const colorParserConfig = useSerialStore((state) => state.colorParserConfig);

  const levelColors: Record<SerialLine["level"], string> = {
    error: "text-red-500",
    warn: "text-yellow-500",
    debug: "text-blue-400",
    info: "text-foreground",
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${ms}`;
  };

  // Format as hex
  const formatHex = (data: number[]) => {
    if (!data || data.length === 0) {
      const bytes = new TextEncoder().encode(line.text);
      return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
    }
    return data.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  };

  // Parse ANSI and custom color markers
  const textSegments = useMemo(() => {
    const ansiSegments = parseAnsiText(line.text);

    if (colorParserConfig.enabled) {
      const result: Array<{
        text: string;
        className?: string;
        styles?: React.CSSProperties;
      }> = [];

      for (const ansiSeg of ansiSegments) {
        const customSegments = parseColoredText(ansiSeg.text, colorParserConfig);

        for (const customSeg of customSegments) {
          result.push({
            text: customSeg.text,
            className: ansiSeg.className,
            styles: customSeg.styles,
          });
        }
      }

      return result;
    } else {
      return ansiSegments.map((seg) => ({
        text: seg.text,
        className: seg.className,
        styles: {},
      }));
    }
  }, [line.text, colorParserConfig]);

  return (
    <div className={cn("flex items-baseline gap-2 py-0.5 hover:bg-muted/50", levelColors[line.level])}>
      {showTimestamp && (
        <span className="text-muted-foreground shrink-0 select-none font-mono">[{formatTime(line.timestamp)}]</span>
      )}
      {showDirectionPrefix && (
        <span
          className={cn(
            "shrink-0 select-none font-mono text-xs",
            line.direction === "rx" ? "text-emerald-600" : "text-sky-600"
          )}
        >
          {line.direction === "rx" ? "【RX】" : "【TX】"}
        </span>
      )}
      {displayMode === "hex" ? (
        <span className="whitespace-pre-wrap break-all font-mono">{formatHex(line.rawData || [])}</span>
      ) : (
        <span className="whitespace-pre-wrap break-all">
          {textSegments.map((segment, index) => (
            <span key={index} className={segment.className} style={segment.styles}>
              {segment.text}
            </span>
          ))}
        </span>
      )}
    </div>
  );
});
