import { useRef, useEffect, useState, useCallback } from "react";
import { useLogStore } from "@/stores/logStore";
import { useUiPreferencesStore } from "@/stores/uiPreferencesStore";
import { formatTime } from "@/lib/utils";
import { Trash2, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogPanel() {
  const { logs, clearLogs } = useLogStore();
  const storedHeight = useUiPreferencesStore((state) => state.logPanelHeight);
  const setStoredHeight = useUiPreferencesStore((state) => state.setLogPanelHeight);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(storedHeight);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // 自动滚动到底部（最新日志）- 使用 requestAnimationFrame 节流
  useEffect(() => {
    if (scrollRef.current && !isResizing) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [logs, isResizing]);

  // 开始拖动
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
    e.preventDefault();
    // 禁用文本选择
    document.body.style.userSelect = "none";
  }, [height]);

  // 拖动中 - 使用 requestAnimationFrame 节流
  useEffect(() => {
    setHeight(storedHeight);
  }, [storedHeight]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // 取消之前的 RAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const deltaY = startYRef.current - e.clientY;
        const newHeight = Math.max(80, Math.min(600, startHeightRef.current + deltaY));
        setHeight(newHeight);
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = "";
      setStoredHeight(height);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [height, isResizing, setStoredHeight]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-500";
      case "warn":
        return "text-yellow-500";
      case "success":
        return "text-green-500";
      default:
        return "text-muted-foreground";
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error":
        return "[错误]";
      case "warn":
        return "[警告]";
      case "success":
        return "[成功]";
      default:
        return "[信息]";
    }
  };

  return (
    <div
      style={{ height: `${height}px` }}
      className="surface-card relative overflow-hidden rounded-[28px]"
    >
      {/* 拖动手柄 */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-primary/20 transition-colors ${
          isResizing ? "bg-primary/30" : ""
        }`}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <div>
          <div className="text-xs font-medium text-foreground">输出日志</div>
          <div className="text-[11px] text-muted-foreground">显示连接、解析、烧录和运行状态信息</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={clearLogs}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="overflow-y-auto p-3 font-mono text-xs"
        style={{ height: `calc(100% - 46px)` }}
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 rounded-xl px-2 py-1">
            <span className="text-muted-foreground shrink-0">
              [{formatTime(log.timestamp)}]
            </span>
            <span className={`shrink-0 ${getLevelColor(log.level)}`}>
              {getLevelIcon(log.level)}
            </span>
            <span className={getLevelColor(log.level)}>{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-muted-foreground text-center py-4">
            暂无日志
          </div>
        )}
      </div>
    </div>
  );
}
