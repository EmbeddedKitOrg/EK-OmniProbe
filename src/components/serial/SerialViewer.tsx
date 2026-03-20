import React, { useRef, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSerialStore } from "@/stores/serialStore";
import { cn } from "@/lib/utils";
import type { SerialLine } from "@/lib/serialTypes";
import { parseColoredText } from "@/lib/rttColorParser";

// ANSI color mapping (same as RttViewer)
const ANSI_COLORS: Record<string, string> = {
  "30": "text-gray-900 dark:text-gray-300",
  "31": "text-red-500",
  "32": "text-green-500",
  "33": "text-yellow-500",
  "34": "text-blue-500",
  "35": "text-purple-500",
  "36": "text-cyan-500",
  "37": "text-gray-100",
  "90": "text-gray-500",
  "91": "text-red-400",
  "92": "text-green-400",
  "93": "text-yellow-400",
  "94": "text-blue-400",
  "95": "text-purple-400",
  "96": "text-cyan-400",
  "97": "text-white",
};

const ANSI_BG_COLORS: Record<string, string> = {
  "40": "bg-gray-900",
  "41": "bg-red-500",
  "42": "bg-green-500",
  "43": "bg-yellow-500",
  "44": "bg-blue-500",
  "45": "bg-purple-500",
  "46": "bg-cyan-500",
  "47": "bg-gray-100",
};

interface TextSegment {
  text: string;
  className: string;
}

// Parse ANSI escape sequences
function parseAnsiText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const ansiRegex = /\x1b\[([0-9;]*)m/g;

  let lastIndex = 0;
  let currentClass = "";
  let match;

  while ((match = ansiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        className: currentClass,
      });
    }

    const codes = match[1].split(";");
    for (const code of codes) {
      if (code === "0" || code === "") {
        currentClass = "";
      } else if (code === "1") {
        currentClass += " font-bold";
      } else if (ANSI_COLORS[code]) {
        currentClass = currentClass.replace(/text-\S+/g, "").trim();
        currentClass += " " + ANSI_COLORS[code];
      } else if (ANSI_BG_COLORS[code]) {
        currentClass = currentClass.replace(/bg-\S+/g, "").trim();
        currentClass += " " + ANSI_BG_COLORS[code];
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      className: currentClass,
    });
  }

  return segments.length > 0 ? segments : [{ text, className: "" }];
}

interface SerialViewerProps {
  direction?: "rx" | "tx";
  title?: string;
}

export function SerialViewer({ direction, title }: SerialViewerProps) {
  const { autoScroll, showTimestamp, running, displayMode, connected, lines, searchQuery } = useSerialStore();

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
                  displayMode={displayMode}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SerialLineItemProps {
  line: SerialLine;
  showTimestamp: boolean;
  displayMode: "text" | "hex";
}

const SerialLineItem = React.memo(function SerialLineItem({ line, showTimestamp, displayMode }: SerialLineItemProps) {
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
    <div className={cn("flex gap-2 py-0.5 hover:bg-muted/50", levelColors[line.level])}>
      {showTimestamp && (
        <span className="text-muted-foreground shrink-0 select-none">
          [{formatTime(line.timestamp)}]
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
