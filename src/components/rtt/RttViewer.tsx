import React, { useEffect, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRttStore } from "@/stores/rttStore";
import { useLogStore } from "@/stores/logStore";
import { cn } from "@/lib/utils";
import type { RttLine } from "@/lib/types";
import { parseColoredText } from "@/lib/rttColorParser";
import { parseAnsiText } from "@/lib/ansiParser";
import { useViewerSelection, formatRttLineForCopy, copyTextToClipboard } from "@/lib/viewerCopy";
import { useShallow } from "zustand/react/shallow";

export function RttViewer() {
  const { lines, selectedChannel, searchQuery, autoScroll, showTimestamp, isRunning, displayMode } = useRttStore(
    useShallow((state) => ({
      lines: state.lines,
      selectedChannel: state.selectedChannel,
      searchQuery: state.searchQuery,
      autoScroll: state.autoScroll,
      showTimestamp: state.showTimestamp,
      isRunning: state.isRunning,
      displayMode: state.displayMode,
    }))
  );
  const addLog = useLogStore((state) => state.addLog);

  // 过滤行
  const filteredLines = useMemo(() => {
    let filtered = lines;

    // 按通道过滤
    if (selectedChannel >= 0) {
      filtered = filtered.filter((line) => line.channel === selectedChannel);
    }

    // 按搜索词过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((line) => line.text.toLowerCase().includes(query));
    }

    return filtered;
  }, [lines, selectedChannel, searchQuery]);

  const { scrollRef, getSelectedRange, isSelectAll, highlight } = useViewerSelection(filteredLines.length);

  const rowVirtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 22, // 估算行高（像素）
    overscan: 15, // 额外渲染条数
  });

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && filteredLines.length > 0) {
      rowVirtualizer.scrollToIndex(filteredLines.length - 1, { align: "end" });
    }
  }, [filteredLines.length, autoScroll, rowVirtualizer]);

  // Ctrl+C：按行号区间从数据重建（不受虚拟化卸载影响）
  const handleCopy = useCallback(
    (event: KeyboardEvent) => {
      if (!(event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "c")) return;
      const range = getSelectedRange();
      if (!range) return;
      const slice = filteredLines.slice(range.start, range.end + 1);
      if (slice.length === 0) return;
      event.preventDefault();
      copyTextToClipboard(
        slice.map((line) => formatRttLineForCopy(line, showTimestamp)).join("\n"),
        isSelectAll() ? "全部" : "选区",
        addLog
      );
    },
    [getSelectedRange, isSelectAll, filteredLines, showTimestamp, addLog]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleCopy);
    return () => document.removeEventListener("keydown", handleCopy);
  }, [handleCopy]);

  // 空状态
  if (filteredLines.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {isRunning ? "等待数据..." : "点击「启动」开始接收 RTT 数据"}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        "h-full overflow-y-auto font-mono text-xs leading-5 p-2 bg-background",
        highlight && "select-none" // 跨行/全选时关掉原生选区，只留行级高亮，避免两套高亮打架
      )}
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
          const selected = !!highlight && virtualRow.index >= highlight.start && virtualRow.index <= highlight.end;
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
              <RttLineItem line={line} showTimestamp={showTimestamp} displayMode={displayMode} selected={selected} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RttLineItemProps {
  line: RttLine;
  showTimestamp: boolean;
  displayMode: "text" | "hex";
  selected: boolean;
}

const RttLineItem = React.memo(function RttLineItem({ line, showTimestamp, displayMode, selected }: RttLineItemProps) {
  const colorParserConfig = useRttStore((state) => state.colorParserConfig);

  const levelColors: Record<RttLine["level"], string> = {
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

  // 格式化为十六进制
  const formatHex = (data: number[]) => {
    if (!data || data.length === 0) {
      // 如果没有原始数据，从文本重新编码
      const bytes = new TextEncoder().encode(line.text);
      return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
    }
    return data.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  };

  // 同时支持 ANSI 和自定义颜色标记
  const textSegments = useMemo(() => {
    // 先解析 ANSI 转义序列
    const ansiSegments = parseAnsiText(line.text);

    // 如果启用了自定义标记，在每个 ANSI 片段中再解析自定义标记
    if (colorParserConfig.enabled) {
      const result: Array<{ text: string; className?: string; styles?: React.CSSProperties }> = [];

      for (const ansiSeg of ansiSegments) {
        const customSegments = parseColoredText(ansiSeg.text, colorParserConfig);

        // 合并 ANSI 的 className 和自定义标记的 styles
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
      // 只使用 ANSI 解析
      return ansiSegments.map((seg) => ({
        text: seg.text,
        className: seg.className,
        styles: {},
      }));
    }
  }, [line.text, colorParserConfig]);

  return (
    <div className={cn("flex gap-2 py-0.5 hover:bg-muted/50", levelColors[line.level], selected && "bg-primary/20")}>
      {showTimestamp && (
        <span className="text-muted-foreground shrink-0 select-none">[{formatTime(line.timestamp)}]</span>
      )}
      <span className="text-muted-foreground shrink-0 select-none">[{line.channel}]</span>
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
