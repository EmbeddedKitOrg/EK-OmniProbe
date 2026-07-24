import { useCallback, useEffect, useMemo, useRef } from "react";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { sendSerialPayload } from "@/lib/serialSend";
import {
  SERIAL_CONTROL_PANEL_ACTION_EVENT,
  SERIAL_CONTROL_PANEL_READY_EVENT,
  SERIAL_CONTROL_PANEL_SEND_RESULT_EVENT,
  SERIAL_CONTROL_PANEL_SNAPSHOT_EVENT,
  SERIAL_CONTROL_PANEL_WINDOW_LABEL,
  type SerialControlPanelSendResult,
  type SerialControlPanelSnapshot,
  type SerialControlPanelWindowAction,
} from "@/lib/serialControlPanelWindow";
import { useSerialStore } from "@/stores/serialStore";

interface SerialControlPanelWindowControls {
  open: () => void | Promise<void>;
  focus: () => void | Promise<void>;
  restore: () => void | Promise<void>;
}

let windowControls: SerialControlPanelWindowControls | undefined;

export function useSerialControlPanelWindowControls() {
  const detached = useSerialStore((state) => state.controlPanelDetached);
  return {
    detached,
    open: () => windowControls?.open(),
    focus: () => windowControls?.focus(),
    restore: () => windowControls?.restore(),
  };
}

export function useSerialControlPanelWindowHost(snapshot: SerialControlPanelSnapshot) {
  const detached = useSerialStore((state) => state.controlPanelDetached);
  const setDetached = useSerialStore((state) => state.setControlPanelDetached);
  const snapshotRef = useRef(snapshot);
  const detachedRef = useRef(detached);
  snapshotRef.current = snapshot;
  detachedRef.current = detached;

  const restore = useCallback(async () => {
    setDetached(false);
    const popup = await WebviewWindow.getByLabel(SERIAL_CONTROL_PANEL_WINDOW_LABEL);
    await popup?.close().catch(() => undefined);
  }, [setDetached]);

  const focus = useCallback(async () => {
    const popup = await WebviewWindow.getByLabel(SERIAL_CONTROL_PANEL_WINDOW_LABEL);
    await popup?.unminimize().catch(() => undefined);
    await popup?.show().catch(() => undefined);
    await popup?.setFocus().catch(() => undefined);
  }, []);

  const open = useCallback(async () => {
    const existing = await WebviewWindow.getByLabel(SERIAL_CONTROL_PANEL_WINDOW_LABEL);
    if (existing) {
      setDetached(true);
      await focus();
      await emitTo(SERIAL_CONTROL_PANEL_WINDOW_LABEL, SERIAL_CONTROL_PANEL_SNAPSHOT_EVENT, snapshotRef.current);
      return;
    }

    const popupUrl = new URL(window.location.href);
    popupUrl.searchParams.set("serial_control_panel", "1");
    popupUrl.hash = "";
    const popup = new WebviewWindow(SERIAL_CONTROL_PANEL_WINDOW_LABEL, {
      url: popupUrl.toString(),
      title: "串口控制面板",
      width: 1440,
      height: 920,
      minWidth: 900,
      minHeight: 620,
      center: true,
      resizable: true,
    });

    void popup.once("tauri://created", async () => {
      setDetached(true);
      await emitTo(SERIAL_CONTROL_PANEL_WINDOW_LABEL, SERIAL_CONTROL_PANEL_SNAPSHOT_EVENT, snapshotRef.current).catch(
        () => undefined
      );
    });
    void popup.once("tauri://error", () => setDetached(false));
  }, [focus, setDetached]);

  useEffect(() => {
    if (!detached) return;
    const intervalId = window.setInterval(
      () => {
        void emitTo(SERIAL_CONTROL_PANEL_WINDOW_LABEL, SERIAL_CONTROL_PANEL_SNAPSHOT_EVENT, snapshotRef.current).catch(
          () => undefined
        );
      },
      Math.max(snapshot.chartConfig.updateInterval, 50)
    );
    return () => window.clearInterval(intervalId);
  }, [detached, snapshot.chartConfig.updateInterval]);

  useEffect(() => {
    const readyUnlisten = listen(SERIAL_CONTROL_PANEL_READY_EVENT, () => {
      if (!detachedRef.current) return;
      void emitTo(SERIAL_CONTROL_PANEL_WINDOW_LABEL, SERIAL_CONTROL_PANEL_SNAPSHOT_EVENT, snapshotRef.current).catch(
        () => undefined
      );
    });
    const actionUnlisten = listen<SerialControlPanelWindowAction>(
      SERIAL_CONTROL_PANEL_ACTION_EVENT,
      async ({ payload }) => {
        if (payload.type === "restore-inline") {
          await restore();
          return;
        }
        const result: SerialControlPanelSendResult = { id: payload.id };
        try {
          await sendSerialPayload(payload.text, { hexMode: payload.hexMode });
        } catch (error) {
          result.error = String(error);
        }
        await emitTo(SERIAL_CONTROL_PANEL_WINDOW_LABEL, SERIAL_CONTROL_PANEL_SEND_RESULT_EVENT, result).catch(
          () => undefined
        );
      }
    );
    return () => {
      void readyUnlisten.then((unlisten) => unlisten());
      void actionUnlisten.then((unlisten) => unlisten());
    };
  }, [restore]);

  const controls = useMemo(() => ({ open, focus, restore }), [focus, open, restore]);
  useEffect(() => {
    windowControls = controls;
    return () => {
      if (windowControls === controls) windowControls = undefined;
    };
  }, [controls]);
}

export async function notifySerialControlPanelWindowReady() {
  await emit(SERIAL_CONTROL_PANEL_READY_EVENT);
}

export async function dispatchSerialControlPanelWindowAction(action: SerialControlPanelWindowAction) {
  await emit(SERIAL_CONTROL_PANEL_ACTION_EVENT, action);
}
