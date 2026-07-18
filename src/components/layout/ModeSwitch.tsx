import { useState } from "react";
import { Bluetooth, Bug, Plug2, Terminal, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore, type AppMode } from "@/stores/appStore";
import { useRttStore } from "@/stores/rttStore";
import { useFlashStore } from "@/stores/flashStore";
import { useDebugStore } from "@/stores/debugStore";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ModeSwitchProps {
  className?: string;
  orientation?: "horizontal" | "vertical";
}

const MODES = [
  { id: "flash", label: "烧录", icon: Zap },
  { id: "rtt", label: "RTT", icon: Terminal },
  { id: "serial", label: "串口", icon: Plug2 },
  { id: "bluetooth", label: "蓝牙", icon: Bluetooth },
  { id: "debug", label: "调试", icon: Bug },
] as const;

export function ModeSwitch({ className, orientation = "horizontal" }: ModeSwitchProps) {
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const rttRunning = useRttStore((state) => state.isRunning);
  const flashing = useFlashStore((state) => state.flashing);
  const debugAttached = useDebugStore((state) => state.state) !== "detached";
  const vertical = orientation === "vertical";
  type ConfirmReason = "rtt" | "debug";
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    targetMode: AppMode | null;
    reason: ConfirmReason | null;
  }>({ open: false, targetMode: null, reason: null });

  const handleModeChange = (newMode: AppMode) => {
    if (newMode === mode) return;
    if (rttRunning && newMode === "flash") {
      setConfirmDialog({ open: true, targetMode: newMode, reason: "rtt" });
      return;
    }
    if (debugAttached && mode === "debug" && newMode !== "debug") {
      setConfirmDialog({ open: true, targetMode: newMode, reason: "debug" });
      return;
    }
    if (!flashing) setMode(newMode);
  };

  const closeDialog = () => setConfirmDialog({ open: false, targetMode: null, reason: null });
  const handleConfirmSwitch = () => {
    if (confirmDialog.targetMode) setMode(confirmDialog.targetMode);
    closeDialog();
  };
  const dialogText =
    confirmDialog.reason === "debug"
      ? "调试会话仍在 attach 状态。切换工作台不会自动 Detach；如需让其他模式使用同一探针，请先回到调试工作台断开会话。确定继续？"
      : "RTT 正在运行。切换到烧录模式会停止 RTT 数据接收，确定继续吗？";

  return (
    <>
      <div
        className={cn(
          vertical
            ? "flex w-full flex-col items-stretch gap-1"
            : "flex items-center gap-1 rounded-xl border border-border/60 bg-white/78 p-1 shadow-[0_4px_12px_rgba(73,93,142,0.1)] backdrop-blur",
          className
        )}
      >
        {MODES.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={mode === id ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange(id)}
            disabled={flashing}
            className={cn(
              vertical ? "h-12 w-full flex-col gap-1 rounded-xl px-1" : "h-8 gap-1 rounded-lg px-3",
              mode === id && "bg-primary text-primary-foreground shadow-[0_6px_14px_rgba(73,110,214,0.2)]"
            )}
          >
            <Icon className={vertical ? "h-4 w-4" : "h-3.5 w-3.5"} />
            <span className={vertical ? "text-[10px] font-medium leading-none" : "text-xs font-medium"}>{label}</span>
          </Button>
        ))}
      </div>

      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认切换模式</DialogTitle>
            <DialogDescription>{dialogText}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={handleConfirmSwitch}>确认切换</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
