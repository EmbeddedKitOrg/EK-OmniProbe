import React, { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSerialStore } from "@/stores/serialStore";
import type { ColorParserConfig } from "@/lib/rttColorParser";
import { parseColoredText } from "@/lib/rttColorParser";
import { parseAnsiText } from "@/lib/ansiParser";

interface SerialTerminalViewerProps {
  title?: string;
}

export function SerialTerminalViewer({ title }: SerialTerminalViewerProps) {
  const {
    autoScroll,
    connected,
    running,
    terminalLines,
    terminalActiveLine,
    colorParserConfig,
  } = useSerialStore();

  const displayLines = useMemo(() => {
    if (terminalActiveLine.length === 0) {
      return terminalLines;
    }

    return [
      ...terminalLines,
      {
        id: -1,
        text: terminalActiveLine,
      },
    ];
  }, [terminalActiveLine, terminalLines]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: displayLines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 22,
    overscan: 15,
  });

  useEffect(() => {
    if (autoScroll && displayLines.length > 0) {
      rowVirtualizer.scrollToIndex(displayLines.length - 1, { align: "end" });
    }
  }, [autoScroll, displayLines.length, rowVirtualizer]);

  const emptyMessage = useMemo(() => {
    if (!connected) {
      return "请先连接串口，再进入终端会话。";
    }
    if (!running) {
      return "点击「开始」后，终端会话会在这里持续展开。";
    }
    return "等待设备输出 prompt 或命令回显...";
  }, [connected, running]);

  if (displayLines.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {title && (
          <div className="border-b border-border bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">
            {title}
          </div>
        )}
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {title && (
        <div className="border-b border-border bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">
          {title} ({displayLines.length})
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-background p-2 font-mono text-xs leading-5">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const line = displayLines[virtualRow.index];
            return (
              <div
                key={`${line.id}-${virtualRow.key}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <SerialTerminalLineItem
                  text={line.text}
                  colorParserEnabled={colorParserConfig.enabled}
                  colorParserConfig={colorParserConfig}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SerialTerminalLineItemProps {
  text: string;
  colorParserEnabled: boolean;
  colorParserConfig: ColorParserConfig;
}

const SerialTerminalLineItem = React.memo(function SerialTerminalLineItem({
  text,
  colorParserEnabled,
  colorParserConfig,
}: SerialTerminalLineItemProps) {
  const textSegments = useMemo(() => {
    const ansiSegments = parseAnsiText(text);

    if (!colorParserEnabled) {
      return ansiSegments.map((segment) => ({
        text: segment.text,
        className: segment.className,
        styles: {},
      }));
    }

    const result: Array<{
      text: string;
      className?: string;
      styles?: React.CSSProperties;
    }> = [];

    for (const ansiSegment of ansiSegments) {
      const customSegments = parseColoredText(ansiSegment.text, colorParserConfig);

      for (const customSegment of customSegments) {
        result.push({
          text: customSegment.text,
          className: ansiSegment.className,
          styles: customSegment.styles,
        });
      }
    }

    return result;
  }, [colorParserConfig, colorParserEnabled, text]);

  return (
    <div className="py-0.5 hover:bg-muted/50">
      <span className="whitespace-pre-wrap break-all">
        {textSegments.map((segment, index) => (
          <span key={index} className={segment.className} style={segment.styles}>
            {segment.text}
          </span>
        ))}
      </span>
    </div>
  );
});
