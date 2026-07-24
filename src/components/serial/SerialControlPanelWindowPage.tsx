import { useCallback, useEffect, useMemo, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ArrowLeftRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function SerialControlPanelWindowPage() {
  const currentWindow = useMemo(() => getCurrentWebviewWindow(), []);
  const pendingRef = useRef(
    new Map<string, { resolve: () => void; reject: (error: Error) => void; timeoutId: number }>()
  );
  const restoringRef = useRef(false);

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

  return (
    <div className="surface-strong flex h-screen flex-col gap-2 overflow-hidden p-3 text-foreground">
      <div className="flex items-center justify-between rounded-[26px] border border-border/60 bg-white/72 px-4 py-3 shadow-[0_12px_26px_rgba(73,93,142,0.08)] backdrop-blur">
        <div>
          <div className="text-sm font-medium">串口控制面板</div>
          <div className="text-[11px] text-muted-foreground">独立窗口模式，串口收发仍由主窗口统一管理。</div>
        </div>
        <div className="flex items-center gap-2">
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
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="min-w-0 flex-1 overflow-hidden rounded-[20px] border border-border/60">
          <SerialControlPanel sendPayload={sendPayload} showWorkspaceActions={false} />
        </div>
        <aside className="w-80 shrink-0 overflow-y-auto rounded-[20px] border border-border/60 bg-white/75 p-4">
          <div className="mb-4 text-sm font-medium">组件属性</div>
          <div id="serial-widget-inspector" />
        </aside>
      </div>
    </div>
  );
}
