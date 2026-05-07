import React, { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSerialStore } from "@/stores/serialStore";
import { useLogStore } from "@/stores/logStore";
import { cn } from "@/lib/utils";
import type { SerialLine } from "@/lib/serialTypes";
import { parseColoredText } from "@/lib/rttColorParser";
import { parseAnsiText } from "@/lib/ansiParser";

interface SerialViewerProps {
  direction?: "rx" | "tx";
  title?: string;
}

type CopyMode = "plain" | "with-timestamp" | "full";

const formatTimestamp = (date: Date) => {
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
};

const formatLineForCopy = (line: SerialLine, mode: CopyMode): string => {
  const ts = `[${formatTimestamp(line.timestamp)}]`;
  const dir = line.direction === "rx" ? "【RX】" : "【TX】";
  switch (mode) {
    case "plain":
      return line.text;
    case "with-timestamp":
      return `${ts} ${line.text}`;
    case "full":
      return `${ts} ${dir} ${line.text}`;
  }
};

const findLineIndex = (node: Node | null, container: HTMLElement): number | null => {
  let el: HTMLElement | null =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node?.parentElement ?? null;
  while (el && el !== container) {
    const attr = el.getAttribute?.("data-line-index");
    if (attr != null) return Number(attr);
    el = el.parentElement;
  }
  return null;
};

const getSelectedLineRange = (
  container: HTMLElement
): { start: number; end: number } | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return null;
  }
  const a = findLineIndex(range.startContainer, container);
  const b = findLineIndex(range.endContainer, container);
  if (a == null || b == null) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
};

export function SerialViewer({ direction, title }: SerialViewerProps) {
  const { autoScroll, showTimestamp, showDirectionPrefix, running, displayMode, connected, lines, searchQuery } = useSerialStore();
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
      filtered = filtered.filter((line) =>
        line.text.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [lines, direction, searchQuery]);

  const scrollRef = useRef<HTMLDivElement>(null);

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
      const container = scrollRef.current;
      if (!container) return false;
      const sel = window.getSelection();
      const rawText = sel ? sel.toString() : "";

      if (mode === "plain") {
        if (!rawText) return false;
        writeToClipboard(rawText, "纯文本");
        return true;
      }

      const range = getSelectedLineRange(container);
      if (!range) return false;

      const slice = filteredLines.slice(range.start, range.end + 1);
      if (slice.length === 0) return false;
      const text = slice.map((line) => formatLineForCopy(line, mode)).join("\n");
      writeToClipboard(text, mode === "with-timestamp" ? "含时间戳" : "完整行");
      return true;
    },
    [filteredLines, writeToClipboard]
  );

  // Ctrl+Shift+C：复制完整行（时间戳 + 方向 + 正文）
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c")) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      if (!scrollRef.current?.contains(sel.anchorNode)) return;
      if (copySelection("full")) {
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [copySelection]);

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
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {getEmptyMessage()}
        </div>
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
          {item.hint && (
            <span className="text-xs text-muted-foreground">{item.hint}</span>
          )}
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

const SerialLineItem = React.memo(function SerialLineItem({ line, showTimestamp, showDirectionPrefix, displayMode }: SerialLineItemProps) {
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
    return data
      .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");
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
        <span className="text-muted-foreground shrink-0 select-none font-mono">
          [{formatTime(line.timestamp)}]
        </span>
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
        <span className="whitespace-pre-wrap break-all font-mono">
          {formatHex(line.rawData || [])}
        </span>
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
