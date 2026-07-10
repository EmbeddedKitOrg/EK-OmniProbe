import { useRef, useEffect, useState, useCallback } from "react";
import { useLogStore } from "@/stores/logStore";
import { useUiPreferencesStore } from "@/stores/uiPreferencesStore";
import { formatTime } from "@/lib/utils";
import { Trash2, GripHorizontal, ChevronDown, ChevronUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportLogs } from "@/lib/exporters";
import { useShallow } from "zustand/react/shallow";

export function LogPanel() {
  const { logs, clearLogs, addLog } = useLogStore(
    useShallow((state) => ({ logs: state.logs, clearLogs: state.clearLogs, addLog: state.addLog }))
  );

  const handleExport = useCallback(async () => {
    if (logs.length === 0) {
      addLog("warn", "暂无日志可导出");
      return;
    }
    try {
      const path = await exportLogs(logs);
      if (path) addLog("success", `日志已导出: ${path}`);
    } catch (err) {
      addLog("error", `导出日志失败: ${err}`);
    }
  }, [logs, addLog]);
  const storedHeight = useUiPreferencesStore((state) => state.logPanelHeight);
  const setStoredHeight = useUiPreferencesStore((state) => state.setLogPanelHeight);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(storedHeight);
  const [isResizing, setIsResizing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const expandedHeightRef = useRef(storedHeight);
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
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) {
        return;
      }
      setIsResizing(true);
      startYRef.current = e.clientY;
      startHeightRef.current = height;
      e.preventDefault();
      // 禁用文本选择
      document.body.style.userSelect = "none";
    },
    [collapsed, height]
  );

  const toggleCollapsed = useCallback(() => {
    if (collapsed) {
      const nextHeight = Math.max(expandedHeightRef.current, 80);
      setHeight(nextHeight);
      setStoredHeight(nextHeight);
      setCollapsed(false);
      return;
    }

    expandedHeightRef.current = height;
    setCollapsed(true);
  }, [collapsed, height, setStoredHeight]);

  // 拖动中 - 使用 requestAnimationFrame 节流
  useEffect(() => {
    if (!collapsed) {
      setHeight(storedHeight);
      expandedHeightRef.current = storedHeight;
    }
  }, [collapsed, storedHeight]);

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
      style={{ height: `${collapsed ? 44 : height}px` }}
      className="surface-card relative overflow-hidden rounded-[28px]"
    >
      {/* 拖动手柄 */}
      {!collapsed && (
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
      )}

      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <div>
          <div className="text-xs font-medium text-foreground">输出日志</div>
          {!collapsed && <div className="text-xs text-muted-foreground">显示连接、解析、烧录和运行状态信息</div>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={toggleCollapsed}
            title={collapsed ? "展开日志" : "折叠日志"}
          >
            {collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleExport} title="导出日志为 .txt">
            <Download className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearLogs} title="清空日志">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div
          ref={scrollRef}
          className="overflow-y-auto p-3 font-mono text-xs leading-relaxed"
          style={{ height: `calc(100% - 46px)` }}
        >
          {logs.map((log) => (
            <div key={log.id} className="flex gap-3 rounded-xl px-2 py-1.5">
              <span className="text-muted-foreground shrink-0">[{formatTime(log.timestamp)}]</span>
              <span className={`shrink-0 ${getLevelColor(log.level)}`}>{getLevelIcon(log.level)}</span>
              <span className={getLevelColor(log.level)}>{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && <div className="text-muted-foreground text-center py-6">暂无日志</div>}
        </div>
      )}
    </div>
  );
}
