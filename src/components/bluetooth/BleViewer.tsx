import React, { useRef, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useBluetoothStore } from "@/stores/bluetoothStore";
import { cn } from "@/lib/utils";
import type { BleLine } from "@/lib/bleTypes";
import { parseColoredText } from "@/lib/rttColorParser";
import { parseAnsiText } from "@/lib/ansiParser";

export function BleViewer() {
  const { autoScroll, showTimestamp, showDirectionPrefix, running, displayMode, connected, lines, searchQuery } =
    useBluetoothStore();

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines;
    const q = searchQuery.toLowerCase();
    return lines.filter((line) => line.text.toLowerCase().includes(q));
  }, [lines, searchQuery]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 22,
    overscan: 15,
  });

  useEffect(() => {
    if (autoScroll && filteredLines.length > 0) {
      rowVirtualizer.scrollToIndex(filteredLines.length - 1, { align: "end" });
    }
  }, [filteredLines.length, autoScroll, rowVirtualizer]);

  const emptyMessage = !connected
    ? "请在左侧扫描并连接 BLE 设备"
    : !running
      ? "选择 Notify 特征值并启动订阅以接收数据"
      : "等待数据...";

  if (filteredLines.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-background p-2 font-mono text-xs leading-5">
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
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <BleLineItem
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
    </div>
  );
}

interface BleLineItemProps {
  line: BleLine;
  showTimestamp: boolean;
  showDirectionPrefix: boolean;
  displayMode: "text" | "hex";
}

const BleLineItem = React.memo(function BleLineItem({
  line,
  showTimestamp,
  showDirectionPrefix,
  displayMode,
}: BleLineItemProps) {
  const colorParserConfig = useBluetoothStore((state) => state.colorParserConfig);

  const levelColors: Record<BleLine["level"], string> = {
    error: "text-red-500",
    warn: "text-yellow-500",
    debug: "text-blue-400",
    info: "text-foreground",
  };

  const formatTime = (date: Date) => {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    const s = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  };

  const formatHex = (data: number[]) => {
    if (!data || data.length === 0) {
      const bytes = new TextEncoder().encode(line.text);
      return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
    }
    return data.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  };

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
    }
    return ansiSegments.map((seg) => ({
      text: seg.text,
      className: seg.className,
      styles: {},
    }));
  }, [line.text, colorParserConfig]);

  return (
    <div className={cn("flex items-baseline gap-2 py-0.5 hover:bg-muted/50", levelColors[line.level])}>
      {showTimestamp && (
        <span className="shrink-0 select-none font-mono text-muted-foreground">[{formatTime(line.timestamp)}]</span>
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
          {textSegments.map((seg, idx) => (
            <span key={idx} className={seg.className} style={seg.styles}>
              {seg.text}
            </span>
          ))}
        </span>
      )}
    </div>
  );
});
