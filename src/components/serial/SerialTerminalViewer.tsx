import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSerialStore } from "@/stores/serialStore";
import { useLogStore } from "@/stores/logStore";
import type { ColorParserConfig } from "@/lib/rttColorParser";
import { parseColoredText } from "@/lib/rttColorParser";
import { parseAnsiText } from "@/lib/ansiParser";
import { writeSerial, writeSerialString } from "@/lib/tauri";
import type { LineEnding } from "@/lib/serialTypes";

interface SerialTerminalViewerProps {
  title?: string;
}

const ARROW_KEY_BYTES: Record<string, number[]> = {
  ArrowUp: [0x1b, 0x5b, 0x41],
  ArrowDown: [0x1b, 0x5b, 0x42],
  ArrowRight: [0x1b, 0x5b, 0x43],
  ArrowLeft: [0x1b, 0x5b, 0x44],
};

function getLineEndingText(lineEnding: LineEnding) {
  switch (lineEnding) {
    case "cr":
      return "\r";
    case "crlf":
      return "\r\n";
    case "none":
      return "";
    case "lf":
    default:
      return "\n";
  }
}

export function SerialTerminalViewer({ title }: SerialTerminalViewerProps) {
  const {
    autoScroll,
    connected,
    running,
    terminalLines,
    terminalActiveLine,
    terminalSettings,
    sendSettings,
    colorParserConfig,
    appendTerminalChunk,
  } = useSerialStore();
  const addLog = useLogStore((state) => state.addLog);
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLTextAreaElement>(null);

  const displayLines = useMemo(() => {
    const committedLines = terminalLines.map((line) => ({
      ...line,
      isActive: false,
    }));

    if (terminalActiveLine.length > 0 || focused) {
      return [
        ...committedLines,
        {
          id: -1,
          text: terminalActiveLine,
          isActive: true,
        },
      ];
    }

    return committedLines;
  }, [focused, terminalActiveLine, terminalLines]);

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

  const focusTerminal = useCallback(() => {
    // 用户正在选择文本时不要夺焦，否则一松手选区就丢
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) {
      return;
    }
    captureRef.current?.focus();
  }, []);

  const copySelectionToClipboard = useCallback(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (!text) return false;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch((err) => {
        addLog("warn", `复制到剪贴板失败: ${err}`);
      });
    }
    return true;
  }, [addLog]);

  const emitLocalEcho = useCallback(
    (text: string) => {
      if (terminalSettings.localEcho && text.length > 0) {
        appendTerminalChunk(text);
      }
    },
    [appendTerminalChunk, terminalSettings.localEcho]
  );

  const sendTextChunk = useCallback(
    async (text: string) => {
      if (!connected || !text) {
        return;
      }

      try {
        setSending(true);
        await writeSerialString(text, sendSettings.encoding, "none");
        emitLocalEcho(text);
      } catch (error) {
        addLog("error", `终端发送失败: ${error}`);
      } finally {
        setSending(false);
      }
    },
    [addLog, connected, emitLocalEcho, sendSettings.encoding]
  );

  const sendRawChunk = useCallback(
    async (bytes: number[], localEchoText = "") => {
      if (!connected || bytes.length === 0) {
        return;
      }

      try {
        setSending(true);
        await writeSerial(bytes);
        emitLocalEcho(localEchoText);
      } catch (error) {
        addLog("error", `终端发送失败: ${error}`);
      } finally {
        setSending(false);
      }
    },
    [addLog, connected, emitLocalEcho]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!connected || !running || sending) {
        return;
      }

      if (event.nativeEvent.isComposing) {
        return;
      }

      // Ctrl+Shift+C：始终复制选区
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c") {
        if (copySelectionToClipboard()) {
          event.preventDefault();
        }
        return;
      }

      // Ctrl+Shift+V：触发粘贴（让浏览器派发 paste 事件给 textarea）
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v") {
        // 浏览器会自动触发 onPaste，无需手动处理
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "c") {
        // 有选区 → 复制；无选区且开启拦截 → SIGINT
        if (copySelectionToClipboard()) {
          event.preventDefault();
          return;
        }
        if (terminalSettings.interceptShortcuts) {
          event.preventDefault();
          void sendRawChunk([0x03]);
        }
        return;
      }

      if (terminalSettings.interceptShortcuts && event.ctrlKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void sendRawChunk([0x04]);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void sendRawChunk(
          Array.from(new TextEncoder().encode(getLineEndingText(sendSettings.lineEnding))),
          getLineEndingText(sendSettings.lineEnding)
        );
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        void sendRawChunk([0x08], "\b");
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        void sendRawChunk([0x09], "\t");
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        void sendRawChunk([0x1b]);
        return;
      }

      if (ARROW_KEY_BYTES[event.key]) {
        event.preventDefault();
        void sendRawChunk(ARROW_KEY_BYTES[event.key]);
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
        event.preventDefault();
        void sendTextChunk(event.key);
      }
    },
    [
      connected,
      running,
      sending,
      terminalSettings.interceptShortcuts,
      sendSettings.lineEnding,
      sendRawChunk,
      sendTextChunk,
      copySelectionToClipboard,
    ]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = event.clipboardData.getData("text");
      if (!text || !connected || !running || sending) {
        return;
      }

      event.preventDefault();
      void sendTextChunk(text);
    },
    [connected, running, sendTextChunk, sending]
  );

  const handleCompositionEnd = useCallback(
    (event: React.CompositionEvent<HTMLTextAreaElement>) => {
      if (!connected || !running || sending) {
        event.currentTarget.value = "";
        return;
      }

      const text = event.data;
      if (text) {
        void sendTextChunk(text);
      }
      event.currentTarget.value = "";
    },
    [connected, running, sendTextChunk, sending]
  );

  const handleInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
    event.currentTarget.value = "";
  }, []);

  const emptyMessage = useMemo(() => {
    if (!connected) {
      return "请先连接串口，再进入终端会话。";
    }
    if (!running) {
      return "点击「开始」后，终端会话会在这里持续展开。";
    }
    return focused ? "终端已激活，可直接输入并回车发送。" : "单击终端区域后可直接输入命令。";
  }, [connected, focused, running]);

  return (
    <div className="relative flex h-full flex-col">
      {title && (
        <div className="border-b border-border bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">
          {title}
        </div>
      )}

      <div className="border-b border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        {focused
          ? "终端已获取焦点，直接输入即可发送。复制：选中后 Ctrl+C 或 Ctrl+Shift+C；Ctrl+C 在无选区时会发送 SIGINT。"
          : "点击终端区域以激活键盘输入；选中文本可直接 Ctrl+C 复制，粘贴会发送到串口。"}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-background p-2 font-mono text-xs leading-5"
        onClick={focusTerminal}
      >
        {displayLines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
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
                    showCursor={line.isActive && focused}
                    colorParserConfig={colorParserConfig}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <textarea
        ref={captureRef}
        className="absolute -left-[9999px] top-0 h-0 w-0 opacity-0"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onInput={handleInput}
        onCompositionEnd={handleCompositionEnd}
      />
    </div>
  );
}

interface SerialTerminalLineItemProps {
  text: string;
  showCursor: boolean;
  colorParserConfig: ColorParserConfig;
}

const SerialTerminalLineItem = React.memo(function SerialTerminalLineItem({
  text,
  showCursor,
  colorParserConfig,
}: SerialTerminalLineItemProps) {
  const textSegments = useMemo(() => {
    const ansiSegments = parseAnsiText(text);

    if (!colorParserConfig.enabled) {
      return ansiSegments.map((segment) => ({
        text: segment.text,
        className: segment.className,
        styles: {} as React.CSSProperties,
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
  }, [colorParserConfig, text]);

  return (
    <div className="py-0.5 hover:bg-muted/50">
      <span className="whitespace-pre-wrap break-all">
        {textSegments.map((segment, index) => (
          <span key={index} className={segment.className} style={segment.styles}>
            {segment.text}
          </span>
        ))}
        {showCursor && (
          <span className="ml-px inline-block h-3.5 w-1.5 animate-pulse bg-foreground align-middle" />
        )}
      </span>
    </div>
  );
});
