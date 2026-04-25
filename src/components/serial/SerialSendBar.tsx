import { useState, useCallback, useRef } from "react";
import { Send, Binary, Trash2, Settings2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSerialStore } from "@/stores/serialStore";
import { useLogStore } from "@/stores/logStore";
import { writeSerialString, writeSerial } from "@/lib/tauri";
import type { LineEnding } from "@/lib/serialTypes";
import { loadSendHistory, pushSendHistory, saveSendHistory } from "@/lib/serialHistory";

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

export function SerialSendBar() {
  const {
    connected,
    sendSettings,
    terminalSettings,
    textViewMode,
    setSendSettings,
    addLine,
    appendTerminalChunk,
  } = useSerialStore();
  const addLog = useLogStore((state) => state.addLog);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<string[]>(loadSendHistory);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const moveHistory = useCallback(
    (direction: "older" | "newer") => {
      if (history.length === 0) {
        return;
      }

      if (direction === "older") {
        const nextIndex = historyIndex < history.length - 1 ? historyIndex + 1 : history.length - 1;
        setHistoryIndex(nextIndex);
        setInputText(history[nextIndex] ?? "");
        return;
      }

      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInputText("");
        return;
      }

      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      setInputText(history[nextIndex] ?? "");
    },
    [history, historyIndex]
  );

  const sendRawBytes = useCallback(
    async (bytes: number[], label: string) => {
      if (!connected) {
        addLog("error", "串口未连接");
        return;
      }

      try {
        setSending(true);
        await writeSerial(bytes);
        addLine({
          timestamp: new Date(),
          text: label,
          level: "info",
          rawData: bytes,
          direction: "tx",
        });
      } catch (error) {
        addLog("error", `发送失败: ${error}`);
      } finally {
        setSending(false);
      }
    },
    [addLine, addLog, connected]
  );

  // Send text
  const handleSend = useCallback(async () => {
    if (!inputText.trim() && !sendSettings.hexMode) {
      return;
    }

    if (!connected) {
      addLog("error", "串口未连接");
      return;
    }

    try {
      setSending(true);

      if (sendSettings.hexMode) {
        // Parse hex string to bytes
        const hexStr = inputText.replace(/\s+/g, "");
        if (!/^[0-9a-fA-F]*$/.test(hexStr) || hexStr.length % 2 !== 0) {
          addLog("error", "无效的十六进制格式");
          return;
        }

        const bytes: number[] = [];
        for (let i = 0; i < hexStr.length; i += 2) {
          bytes.push(parseInt(hexStr.substr(i, 2), 16));
        }

        await writeSerial(bytes);

        // Add to terminal as TX
        addLine({
          timestamp: new Date(),
          text: `HEX: ${inputText}`,
          level: "info",
          rawData: bytes,
          direction: "tx",
        });
      } else {
        await writeSerialString(inputText, sendSettings.encoding, sendSettings.lineEnding);

        // Add to terminal as TX
        addLine({
          timestamp: new Date(),
          text: inputText,
          level: "info",
          rawData: Array.from(new TextEncoder().encode(inputText)),
          direction: "tx",
        });

        if (textViewMode === "terminal" && terminalSettings.localEcho) {
          appendTerminalChunk(`${inputText}${getLineEndingText(sendSettings.lineEnding)}`);
        }
      }

      // Save to history
      setHistory((prev) => pushSendHistory(prev, inputText));

      setInputText("");
      setHistoryIndex(-1);
    } catch (error) {
      addLog("error", `发送失败: ${error}`);
    } finally {
      setSending(false);
    }
  }, [
    inputText,
    connected,
    sendSettings,
    addLog,
    addLine,
    appendTerminalChunk,
    terminalSettings.localEcho,
    textViewMode,
  ]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    if (textViewMode === "terminal") {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveHistory("older");
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveHistory("newer");
        return;
      }

      if (terminalSettings.interceptShortcuts && e.ctrlKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void sendRawBytes([0x03], "CTRL+C");
        return;
      }

      if (terminalSettings.interceptShortcuts && e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void sendRawBytes([0x04], "CTRL+D");
      }
    }
  };

  // Select history item
  const selectHistory = (text: string) => {
    setInputText(text);
    setHistoryIndex(history.findIndex((item) => item === text));
    inputRef.current?.focus();
  };

  // Clear history
  const clearHistory = () => {
    setHistory([]);
    saveSendHistory([]);
    setHistoryIndex(-1);
  };

  return (
    <div className="border-t border-border bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              title="发送选项"
            >
              <Settings2 className="h-3.5 w-3.5" />
              选项
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[320px] rounded-[24px] border-border/70 p-3">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">发送选项</div>
                  <div className="text-xs text-muted-foreground">
                    {sendSettings.encoding.toUpperCase()} · {sendSettings.lineEnding.toUpperCase()} · {sendSettings.hexMode ? "HEX" : "文本"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={sendSettings.hexMode ? "secondary" : "outline"}
                  onClick={() => setSendSettings({ hexMode: !sendSettings.hexMode })}
                  className="gap-1"
                  title="十六进制发送模式"
                >
                  <Binary className="h-3.5 w-3.5" />
                  HEX
                </Button>
              </div>

              <div className="rounded-[20px] border border-border/60 bg-muted/20">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <History className="h-3.5 w-3.5" />
                    发送历史
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={clearHistory}
                    title="清空历史"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="max-h-40 overflow-y-auto p-1.5">
                  {history.length > 0 ? (
                    history.map((item, index) => (
                      <button
                        key={index}
                        className="w-full truncate rounded-xl px-2.5 py-2 text-left text-xs font-mono hover:bg-accent"
                        onClick={() => selectHistory(item)}
                        title={item}
                      >
                        {item}
                      </button>
                    ))
                  ) : (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      暂无历史记录
                    </div>
                  )}
                </div>
              </div>

              {textViewMode === "terminal" && (
                <div className="rounded-[20px] border border-border/60 bg-muted/20 p-2.5">
                  <div className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
                    终端快捷发送
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void sendRawBytes([0x03], "CTRL+C")}>
                      Ctrl+C
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void sendRawBytes([0x04], "CTRL+D")}>
                      Ctrl+D
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void sendRawBytes([0x09], "TAB")}>
                      Tab
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void sendRawBytes([0x1b], "ESC")}>
                      Esc
                    </Button>
                  </div>
                  <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    终端视图下可用上下方向键切换本地发送历史，Ctrl+C / Ctrl+D 可直接发送控制字节。
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {sendSettings.hexMode && (
          <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
            HEX
          </span>
        )}

        {textViewMode === "terminal" && (
          <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground">
            {terminalSettings.localEcho ? "本地回显" : "设备回显"}
          </span>
        )}

        <div className="flex-1">
          <Input
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              sendSettings.hexMode
                ? "输入十六进制 (如: 48 65 6C 6C 6F)"
                : textViewMode === "terminal"
                  ? "输入命令后回车发送，上下键可切换历史"
                  : "输入发送内容... Enter 发送"
            }
            disabled={!connected}
            className="h-8 text-sm font-mono"
          />
        </div>

        <Button
          size="sm"
          onClick={handleSend}
          disabled={!connected || sending || (!inputText.trim() && !sendSettings.hexMode)}
          className="gap-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Send className="h-3.5 w-3.5" />
          发送
        </Button>
      </div>
    </div>
  );
}
