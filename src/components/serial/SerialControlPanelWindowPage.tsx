import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ArrowLeftRight, GripHorizontal, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SerialControlPanel } from "./SerialControlPanel";
import {
  SERIAL_CONTROL_PANEL_SEND_RESULT_EVENT,
  SERIAL_CONTROL_PANEL_SNAPSHOT_EVENT,
  type SerialControlPanelSendResult,
  type SerialControlPanelSnapshot,
} from "@/lib/serialControlPanelWindow";
import {
  dispatchSerialControlPanelWindowAction,
  notifySerialControlPanelWindowReady,
} from "@/hooks/useSerialControlPanelWindow";
import { useSerialStore } from "@/stores/serialStore";

interface FloatingPanelPosition {
  x: number;
  y: number;
}

export function clampFloatingPanelPosition(
  position: FloatingPanelPosition,
  container: { width: number; height: number },
  panel: { width: number; height: number },
  inset = 12
): FloatingPanelPosition {
  return {
    x: Math.min(0, Math.max(panel.width + inset * 2 - container.width, position.x)),
    y: Math.min(Math.max(0, container.height - panel.height - inset * 2), Math.max(0, position.y)),
  };
}

export function SerialControlPanelWindowPage() {
  const currentWindow = useMemo(() => getCurrentWebviewWindow(), []);
  const pendingRef = useRef(
    new Map<string, { resolve: () => void; reject: (error: Error) => void; timeoutId: number }>()
  );
  const restoringRef = useRef(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const inspectorDragRef = useRef<{
    startX: number;
    startY: number;
    position: FloatingPanelPosition;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorPosition, setInspectorPosition] = useState<FloatingPanelPosition>({ x: 0, y: 0 });

  useEffect(() => {
    if (editing) setInspectorOpen(true);
  }, [editing]);

  useEffect(() => {
    const keepInspectorInBounds = () => {
      const container = workspaceRef.current;
      const panel = inspectorRef.current;
      if (!container || !panel) return;
      setInspectorPosition((position) =>
        clampFloatingPanelPosition(
          position,
          { width: container.clientWidth, height: container.clientHeight },
          { width: panel.offsetWidth, height: panel.offsetHeight }
        )
      );
    };
    window.addEventListener("resize", keepInspectorInBounds);
    return () => window.removeEventListener("resize", keepInspectorInBounds);
  }, []);

  useEffect(() => {
    const snapshotUnlisten = currentWindow.listen<SerialControlPanelSnapshot>(
      SERIAL_CONTROL_PANEL_SNAPSHOT_EVENT,
      ({ payload }) => {
        useSerialStore.setState({
          connected: payload.connected,
          running: payload.running,
          lines: payload.lines.map((line) => ({ ...line, timestamp: new Date(line.timestamp) })),
          autoScroll: payload.autoScroll,
          showTimestamp: payload.showTimestamp,
          timestampFormat: payload.timestampFormat,
          showDirectionPrefix: payload.showDirectionPrefix,
          displayMode: payload.displayMode,
          searchQuery: payload.searchQuery,
          chartData: payload.chartData,
          chartConfig: payload.chartConfig,
          sendSettings: payload.sendSettings,
        });
      }
    );
    const resultUnlisten = currentWindow.listen<SerialControlPanelSendResult>(
      SERIAL_CONTROL_PANEL_SEND_RESULT_EVENT,
      ({ payload }) => {
        const pending = pendingRef.current.get(payload.id);
        if (!pending) return;
        window.clearTimeout(pending.timeoutId);
        pendingRef.current.delete(payload.id);
        if (payload.error) pending.reject(new Error(payload.error));
        else pending.resolve();
      }
    );
    const closeUnlisten = currentWindow.onCloseRequested(async () => {
      if (restoringRef.current) return;
      restoringRef.current = true;
      await dispatchSerialControlPanelWindowAction({ type: "restore-inline" }).catch(() => undefined);
    });

    void Promise.all([snapshotUnlisten, resultUnlisten, closeUnlisten]).then(() =>
      notifySerialControlPanelWindowReady()
    );
    return () => {
      void snapshotUnlisten.then((unlisten) => unlisten());
      void resultUnlisten.then((unlisten) => unlisten());
      void closeUnlisten.then((unlisten) => unlisten());
      pendingRef.current.forEach(({ reject, timeoutId }) => {
        window.clearTimeout(timeoutId);
        reject(new Error("控制面板窗口已关闭"));
      });
      pendingRef.current.clear();
    };
  }, [currentWindow]);

  const sendPayload = useCallback(async (text: string, options: { hexMode?: boolean } = {}) => {
    const id = crypto.randomUUID();
    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pendingRef.current.delete(id);
        reject(new Error("发送请求超时"));
      }, 5_000);
      pendingRef.current.set(id, { resolve, reject, timeoutId });
      void dispatchSerialControlPanelWindowAction({ type: "send", id, text, hexMode: options.hexMode === true }).catch(
        (error) => {
          window.clearTimeout(timeoutId);
          pendingRef.current.delete(id);
          reject(error);
        }
      );
    });
  }, []);

  const close = async () => {
    restoringRef.current = true;
    await dispatchSerialControlPanelWindowAction({ type: "restore-inline" }).catch(() => undefined);
    await currentWindow.destroy().catch(() => undefined);
  };

  const moveInspector = (position: FloatingPanelPosition) => {
    const container = workspaceRef.current;
    const panel = inspectorRef.current;
    if (!container || !panel) return;
    setInspectorPosition(
      clampFloatingPanelPosition(
        position,
        { width: container.clientWidth, height: container.clientHeight },
        { width: panel.offsetWidth, height: panel.offsetHeight }
      )
    );
  };

  const startInspectorDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    inspectorDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      position: inspectorPosition,
    };
  };

  const dragInspector = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = inspectorDragRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveInspector({
      x: drag.position.x + event.clientX - drag.startX,
      y: drag.position.y + event.clientY - drag.startY,
    });
  };

  const finishInspectorDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    inspectorDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const moveInspectorWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const delta = 16;
    const movement = {
      ArrowLeft: { x: -delta, y: 0 },
      ArrowRight: { x: delta, y: 0 },
      ArrowUp: { x: 0, y: -delta },
      ArrowDown: { x: 0, y: delta },
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    moveInspector({ x: inspectorPosition.x + movement.x, y: inspectorPosition.y + movement.y });
  };

  return (
    <div className="surface-strong flex h-screen flex-col gap-2 overflow-hidden p-3 text-foreground">
      <div className="flex items-center justify-between rounded-[26px] border border-border/60 bg-white/72 px-4 py-3 shadow-[0_12px_26px_rgba(73,93,142,0.08)] backdrop-blur">
        <div>
          <div className="text-sm font-medium">串口控制面板</div>
          <div className="text-[11px] text-muted-foreground">独立窗口模式，串口收发仍由主窗口统一管理。</div>
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <Button
              size="sm"
              variant={inspectorOpen ? "secondary" : "outline"}
              className="gap-1"
              onClick={() => setInspectorOpen((open) => !open)}
              aria-expanded={inspectorOpen}
              aria-controls="serial-widget-inspector-panel"
            >
              {inspectorOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              组件属性
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1" onClick={close}>
            <ArrowLeftRight className="h-3.5 w-3.5" />
            收回主窗口
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={close}>
            <X className="h-3.5 w-3.5" />
            关闭
          </Button>
        </div>
      </div>
      <div
        ref={workspaceRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-[20px] border border-border/60"
      >
        <div className="h-full min-w-0 overflow-hidden">
          <SerialControlPanel sendPayload={sendPayload} showWorkspaceActions={false} onEditingChange={setEditing} />
        </div>
        {editing && (
          <aside
            ref={inspectorRef}
            id="serial-widget-inspector-panel"
            className={cn(
              "absolute right-3 top-3 z-20 w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-[20px] border border-border/70 bg-white/92 p-4 shadow-[0_18px_50px_rgba(42,57,91,0.2)] backdrop-blur transition-opacity duration-200",
              !inspectorOpen && "pointer-events-none opacity-0"
            )}
            style={{
              maxHeight: "min(760px, calc(100% - 1.5rem))",
              transform: `translate3d(${inspectorPosition.x}px, ${inspectorPosition.y}px, 0)`,
            }}
          >
            <div className="sticky top-0 z-10 -mx-2 -mt-2 mb-4 flex w-[calc(100%+1rem)] items-center gap-1 rounded-xl bg-white/95 p-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 touch-none cursor-grab items-center gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium active:cursor-grabbing"
                onPointerDown={startInspectorDrag}
                onPointerMove={dragInspector}
                onPointerUp={finishInspectorDrag}
                onPointerCancel={finishInspectorDrag}
                onKeyDown={moveInspectorWithKeyboard}
                aria-label="拖动组件属性面板，可使用方向键微调位置"
              >
                <GripHorizontal className="h-4 w-4 text-muted-foreground" />
                组件属性
                <span className="ml-auto text-[11px] font-normal text-muted-foreground">拖动</span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => setInspectorOpen(false)}
                title="收起组件属性"
                aria-label="收起组件属性"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
            <div id="serial-widget-inspector" className="serial-widget-inspector" />
          </aside>
        )}
      </div>
    </div>
  );
}
