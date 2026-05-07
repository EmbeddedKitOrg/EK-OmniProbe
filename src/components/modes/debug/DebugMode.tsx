import { useCallback, useEffect, useRef } from "react";
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { useDebugStore, type PanelId } from "@/stores/debugStore";
import { useLogStore } from "@/stores/logStore";
import { debugGetCallStack, debugGetStatus } from "@/lib/debug";
import { DebugToolbar } from "./DebugToolbar";
import { PANEL_ORDER, PANEL_REGISTRY } from "./panels/panelRegistry";

const HALT_POLL_INTERVAL_MS = 300;

// dockview 要求每个面板组件接受 IDockviewPanelProps；我们的面板内容自己不需要 props，包一层。
const dockviewComponents = Object.fromEntries(
  PANEL_ORDER.map((id) => {
    const { Component } = PANEL_REGISTRY[id];
    const Wrapper = (_props: IDockviewPanelProps) => <Component />;
    Wrapper.displayName = `DockviewPanel(${id})`;
    return [id, Wrapper];
  })
);

// 关闭后重新打开时，落到哪个分区作为新 tab
type ReinsertGroup = "left" | "center" | "right" | "bottom";
const PANEL_REINSERT_GROUP: Record<PanelId, ReinsertGroup> = {
  symbols: "left",
  source: "center",
  registers: "right",
  locals: "right",
  watch: "right",
  memory: "right",
  callStack: "bottom",
  breakpoints: "bottom",
  output: "bottom",
};

function buildDefaultLayout(api: DockviewApi) {
  api.clear();

  const source = api.addPanel({ id: "source", component: "source", title: "Source" });
  api.addPanel({
    id: "symbols",
    component: "symbols",
    title: "Symbols",
    position: { direction: "left", referencePanel: source.id },
    initialWidth: 220,
  });
  const registers = api.addPanel({
    id: "registers",
    component: "registers",
    title: "Registers",
    position: { direction: "right", referencePanel: source.id },
    initialWidth: 340,
  });
  api.addPanel({
    id: "locals",
    component: "locals",
    title: "Locals",
    position: { referencePanel: registers.id },
  });
  api.addPanel({
    id: "watch",
    component: "watch",
    title: "Watch",
    position: { referencePanel: registers.id },
  });
  api.addPanel({
    id: "memory",
    component: "memory",
    title: "Memory",
    position: { referencePanel: registers.id },
  });
  const callStack = api.addPanel({
    id: "callStack",
    component: "callStack",
    title: "Call Stack",
    position: { direction: "below", referencePanel: source.id },
    initialHeight: 220,
  });
  api.addPanel({
    id: "breakpoints",
    component: "breakpoints",
    title: "Breakpoints",
    position: { referencePanel: callStack.id },
  });
  api.addPanel({
    id: "output",
    component: "output",
    title: "Output",
    position: { referencePanel: callStack.id },
  });

  // 让 source 成为默认激活 tab
  api.getPanel("source")?.api.setActive();
}

function findReferenceForGroup(api: DockviewApi, group: ReinsertGroup): string | undefined {
  // 同分区里随便挑一个还活着的面板作为 referencePanel
  const candidates: Record<ReinsertGroup, PanelId[]> = {
    left: ["symbols"],
    center: ["source"],
    right: ["registers", "locals", "watch", "memory"],
    bottom: ["callStack", "breakpoints", "output"],
  };
  for (const id of candidates[group]) {
    if (api.getPanel(id)) return id;
  }
  return undefined;
}

function reinsertPanel(api: DockviewApi, id: PanelId) {
  if (api.getPanel(id)) return;
  const meta = PANEL_REGISTRY[id];
  const group = PANEL_REINSERT_GROUP[id];
  const ref = findReferenceForGroup(api, group);
  if (ref) {
    api.addPanel({
      id,
      component: id,
      title: meta.title,
      position: { referencePanel: ref },
    });
  } else {
    // 整个目标分区都不存在了，落到当前激活面板旁边
    api.addPanel({ id, component: id, title: meta.title });
  }
}

export function DebugMode() {
  const apiRef = useRef<DockviewApi | null>(null);
  const visiblePanels = useDebugStore((s) => s.visiblePanels);
  const setPanelVisible = useDebugStore((s) => s.setPanelVisible);
  const resetPanelLayout = useDebugStore((s) => s.resetPanelLayout);
  const state = useDebugStore((s) => s.state);
  const setDebugState = useDebugStore((s) => s.setState);
  const setFrames = useDebugStore((s) => s.setFrames);
  const setCurrentFrameId = useDebugStore((s) => s.setCurrentFrameId);
  const addLog = useLogStore((s) => s.addLog);

  // 运行态轮询：检测断点命中或异步停机
  useEffect(() => {
    if (state !== "running") return;
    let cancelled = false;
    const tick = async () => {
      while (!cancelled) {
        await new Promise((resolve) => setTimeout(resolve, HALT_POLL_INTERVAL_MS));
        if (cancelled) return;
        try {
          const status = await debugGetStatus();
          if (!status.attached) {
            setDebugState("detached", null, null);
            return;
          }
          if (status.core?.state === "halted") {
            setDebugState("halted", "breakpoint", status.core.pc ?? null);
            try {
              const frames = await debugGetCallStack();
              setFrames(frames);
              setCurrentFrameId(frames[0]?.id ?? null);
            } catch {
              // 忽略，halt 已经记录
            }
            addLog("info", `命中断点 @ 0x${(status.core.pc ?? 0).toString(16).padStart(8, "0")}`);
            return;
          }
        } catch {
          // 单次轮询失败不致命，继续
        }
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [state, setDebugState, setFrames, setCurrentFrameId, addLog]);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      buildDefaultLayout(event.api);

      // 用户从 dockview tab 上关掉面板 → 同步 store
      const disposable = event.api.onDidRemovePanel((panel) => {
        const id = panel.id as PanelId;
        if (id in PANEL_REGISTRY) {
          setPanelVisible(id, false);
        }
      });

      return () => disposable.dispose();
    },
    [setPanelVisible]
  );

  // 视图菜单勾选 → 同步 dockview
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    for (const id of PANEL_ORDER) {
      const exists = !!api.getPanel(id);
      const shouldExist = visiblePanels[id];
      if (shouldExist && !exists) {
        reinsertPanel(api, id);
      } else if (!shouldExist && exists) {
        const panel = api.getPanel(id);
        if (panel) api.removePanel(panel);
      }
    }
  }, [visiblePanels]);

  const handleResetLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    buildDefaultLayout(api);
    resetPanelLayout();
  }, [resetPanelLayout]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <DebugToolbar onResetLayout={handleResetLayout} />
      <div className="surface-shell relative flex-1 overflow-hidden rounded-[24px]">
        <DockviewReact components={dockviewComponents} onReady={handleReady} className="dockview-theme-light h-full" />
      </div>
    </div>
  );
}
