import {
  ArrowUpFromLine,
  FolderOpen,
  Pause,
  Play,
  Plug,
  RotateCw,
  StepBack,
  StepForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDebugStore } from "@/stores/debugStore";
import { ViewMenu } from "./ViewMenu";

interface DebugToolbarProps {
  onResetLayout: () => void;
}

export function DebugToolbar({ onResetLayout }: DebugToolbarProps) {
  const state = useDebugStore((s) => s.state);
  const haltReason = useDebugStore((s) => s.haltReason);
  const pc = useDebugStore((s) => s.pc);
  const loadedElfPath = useDebugStore((s) => s.loadedElfPath);

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

  // 阶段 1 占位：所有按钮 onClick 暂未接入
  const noop = () => {};

  return (
    <div className="surface-shell flex items-center gap-2 rounded-[24px] px-3 py-2">
      <Button
        size="sm"
        variant={attached ? "outline" : "default"}
        className="gap-1.5 rounded-full px-3"
        onClick={noop}
      >
        <Plug className="h-3.5 w-3.5" />
        <span className="text-xs">{attached ? "Detach" : "Attach"}</span>
      </Button>

      <Button size="sm" variant="outline" className="gap-1.5 rounded-full px-3" onClick={noop}>
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="text-xs">Load ELF…</span>
      </Button>

      <div className="mx-1 h-6 w-px bg-border/60" />

      <Button size="sm" variant="ghost" disabled={!halted} className="gap-1.5 rounded-full px-3" onClick={noop}>
        <Play className="h-3.5 w-3.5" />
        <span className="text-xs">Run</span>
      </Button>

      <Button size="sm" variant="ghost" disabled={!running} className="gap-1.5 rounded-full px-3" onClick={noop}>
        <Pause className="h-3.5 w-3.5" />
        <span className="text-xs">Halt</span>
      </Button>

      <Button size="sm" variant="ghost" disabled={!halted} className="gap-1.5 rounded-full px-3" onClick={noop}>
        <StepForward className="h-3.5 w-3.5" />
        <span className="text-xs">Step In</span>
      </Button>

      <Button size="sm" variant="ghost" disabled={!halted} className="gap-1.5 rounded-full px-3" onClick={noop}>
        <StepBack className="h-3.5 w-3.5 rotate-180" />
        <span className="text-xs">Over</span>
      </Button>

      <Button size="sm" variant="ghost" disabled={!halted} className="gap-1.5 rounded-full px-3" onClick={noop}>
        <ArrowUpFromLine className="h-3.5 w-3.5" />
        <span className="text-xs">Out</span>
      </Button>

      <div className="mx-1 h-6 w-px bg-border/60" />

      <Button size="sm" variant="ghost" disabled={!attached} className="gap-1.5 rounded-full px-3" onClick={noop}>
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
