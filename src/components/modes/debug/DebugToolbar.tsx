import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ArrowUpFromLine, FolderOpen, Pause, Play, Plug, RotateCw, StepBack, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDebugStore } from "@/stores/debugStore";
import { useProbeStore } from "@/stores/probeStore";
import { useLogStore } from "@/stores/logStore";
import {
  debugAttach,
  debugDetach,
  debugHalt,
  debugReset,
  debugRun,
  debugStepIn,
  type DebugCoreState,
} from "@/lib/debug";
import { ViewMenu } from "./ViewMenu";

interface DebugToolbarProps {
  onResetLayout: () => void;
}

export function DebugToolbar({ onResetLayout }: DebugToolbarProps) {
  const state = useDebugStore((s) => s.state);
  const haltReason = useDebugStore((s) => s.haltReason);
  const pc = useDebugStore((s) => s.pc);
  const loadedElfPath = useDebugStore((s) => s.loadedElfPath);
  const setDebugState = useDebugStore((s) => s.setState);
  const setLoadedElfPath = useDebugStore((s) => s.setLoadedElfPath);

  const selectedProbe = useProbeStore((s) => s.selectedProbe);
  const selectedChipName = useProbeStore((s) => s.selectedChipName);
  const settings = useProbeStore((s) => s.settings);
  const addLog = useLogStore((s) => s.addLog);

  const [busy, setBusy] = useState(false);

  const attached = state !== "detached";
  const halted = state === "halted";
  const running = state === "running";

  const elfFileName = loadedElfPath?.split(/[\\/]/).pop() ?? "未加载 ELF";

  const statusText = (() => {
    switch (state) {
      case "detached":
        return "未连接";
      case "attached":
        return "已附加";
      case "running":
        return "运行中";
      case "halted":
        return `已停止${haltReason ? ` · ${haltReason}` : ""}${
          pc !== null ? ` · 0x${pc.toString(16).padStart(8, "0")}` : ""
        }`;
    }
  })();

  // 把 IPC 返回的 core 状态写回 store
  const applyCoreState = (core: DebugCoreState | null, fallback: "attached" = "attached") => {
    if (!core) {
      setDebugState(fallback, null, null);
      return;
    }
    setDebugState(core.state, core.state === "halted" ? "manual" : null, core.pc ?? null);
  };

  const withBusy = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      addLog("error", `${label}: ${error}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAttach = () =>
    withBusy("attach", async () => {
      if (!selectedProbe) {
        addLog("error", "请先在左侧选择调试探针");
        return;
      }
      const chipName = selectedChipName.trim();
      if (!chipName) {
        addLog("error", "请先在左侧输入目标芯片型号");
        return;
      }
      addLog("info", `调试 attach (${chipName})...`);
      const status = await debugAttach({
        probe_identifier: selectedProbe.identifier,
        target: chipName,
        interface_type: settings.interfaceType === "SWD" ? "Swd" : "Jtag",
        clock_speed: settings.clockSpeed,
        connect_mode: settings.connectMode === "Normal" ? "Normal" : "UnderReset",
        halt_after_attach: true,
      });
      applyCoreState(status.core);
      addLog("success", `调试已附加: ${chipName}`);
    });

  const handleDetach = () =>
    withBusy("detach", async () => {
      await debugDetach();
      setDebugState("detached", null, null);
      addLog("info", "调试已断开");
    });

  const handleRun = () =>
    withBusy("run", async () => {
      const core = await debugRun();
      applyCoreState(core);
    });

  const handleHalt = () =>
    withBusy("halt", async () => {
      const core = await debugHalt();
      applyCoreState(core);
      addLog("info", `已停止 @ 0x${(core.pc ?? 0).toString(16).padStart(8, "0")}`);
    });

  const handleStepIn = () =>
    withBusy("step-in", async () => {
      const core = await debugStepIn();
      setDebugState(core.state, "step", core.pc ?? null);
    });

  const handleReset = () =>
    withBusy("reset", async () => {
      const core = await debugReset();
      applyCoreState(core);
      addLog("info", "已 reset");
    });

  const handleLoadElf = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [
          { name: "ELF / AXF", extensions: ["elf", "axf", "out"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (typeof selected === "string") {
        setLoadedElfPath(selected);
        addLog("info", `已选择 ELF: ${selected}`);
        // 阶段 3 才会真正解析 DWARF
      }
    } catch (error) {
      addLog("error", `选择 ELF 失败: ${error}`);
    }
  };

  return (
    <div className="surface-shell flex items-center gap-2 rounded-[24px] px-3 py-2">
      <Button
        size="sm"
        variant={attached ? "outline" : "default"}
        className="gap-1.5 rounded-full px-3"
        disabled={busy}
        onClick={attached ? handleDetach : handleAttach}
      >
        <Plug className="h-3.5 w-3.5" />
        <span className="text-xs">{attached ? "Detach" : "Attach"}</span>
      </Button>

      <Button size="sm" variant="outline" className="gap-1.5 rounded-full px-3" disabled={busy} onClick={handleLoadElf}>
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="text-xs">Load ELF…</span>
      </Button>

      <div className="mx-1 h-6 w-px bg-border/60" />

      <Button
        size="sm"
        variant="ghost"
        disabled={!halted || busy}
        className="gap-1.5 rounded-full px-3"
        onClick={handleRun}
      >
        <Play className="h-3.5 w-3.5" />
        <span className="text-xs">Run</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        disabled={!running || busy}
        className="gap-1.5 rounded-full px-3"
        onClick={handleHalt}
      >
        <Pause className="h-3.5 w-3.5" />
        <span className="text-xs">Halt</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        disabled={!halted || busy}
        className="gap-1.5 rounded-full px-3"
        onClick={handleStepIn}
      >
        <StepForward className="h-3.5 w-3.5" />
        <span className="text-xs">Step In</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        disabled={!halted || busy}
        className="gap-1.5 rounded-full px-3"
        title="阶段 4 接入（需要源码行信息）"
        onClick={() => addLog("info", "Step Over 将在阶段 4 接入")}
      >
        <StepBack className="h-3.5 w-3.5 rotate-180" />
        <span className="text-xs">Over</span>
      </Button>

      <Button
        size="sm"
        variant="ghost"
        disabled={!halted || busy}
        className="gap-1.5 rounded-full px-3"
        title="阶段 4 接入（需要调用栈信息）"
        onClick={() => addLog("info", "Step Out 将在阶段 4 接入")}
      >
        <ArrowUpFromLine className="h-3.5 w-3.5" />
        <span className="text-xs">Out</span>
      </Button>

      <div className="mx-1 h-6 w-px bg-border/60" />

      <Button
        size="sm"
        variant="ghost"
        disabled={!attached || busy}
        className="gap-1.5 rounded-full px-3"
        onClick={handleReset}
      >
        <RotateCw className="h-3.5 w-3.5" />
        <span className="text-xs">Reset</span>
      </Button>

      <div className="mx-1 h-6 w-px bg-border/60" />

      <ViewMenu onResetLayout={onResetLayout} />

      <div className="ml-auto flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
        <span className="truncate font-mono">{elfFileName}</span>
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${
              halted ? "bg-yellow-500" : running ? "bg-green-500" : "bg-muted-foreground"
            }`}
          />
          <span>{statusText}</span>
        </div>
      </div>
    </div>
  );
}
