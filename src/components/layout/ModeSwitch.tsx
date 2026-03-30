import { Zap, Terminal, Plug2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-button";
import { useAppStore, type AppMode } from "@/stores/appStore";
import { useRttStore } from "@/stores/rttStore";
import { useFlashStore } from "@/stores/flashStore";
import { cn } from "@/lib/utils";
import { useState } from "react";
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
}

export function ModeSwitch({ className }: ModeSwitchProps) {
  const { mode, setMode } = useAppStore();
  const { isRunning: rttRunning } = useRttStore();
  const { flashing } = useFlashStore();
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; targetMode: AppMode | null }>({
    open: false,
    targetMode: null,
  });

  const handleModeChange = (newMode: AppMode) => {
    if (newMode === mode) return;

    // If RTT is running and switching to flash mode, show confirmation
    if (rttRunning && newMode === "flash") {
      setConfirmDialog({ open: true, targetMode: newMode });
      return;
    }

    // If flashing is in progress, don't allow switching
    if (flashing) {
      return;
    }

    setMode(newMode);
  };

  const handleConfirmSwitch = () => {
    if (confirmDialog.targetMode) {
      setMode(confirmDialog.targetMode);
    }
    setConfirmDialog({ open: false, targetMode: null });
  };

  return (
    <>
      <div className={cn("flex items-center gap-1 rounded-full border border-border/60 bg-white/78 p-1 shadow-[0_8px_20px_rgba(73,93,142,0.12)] backdrop-blur", className)}>
        <TooltipWrapper tooltip={<p>烧录模式 - 固件烧录、擦除、校验 <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-muted rounded">Ctrl+1</kbd></p>}>
          <Button
            variant={mode === "flash" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("flash")}
            disabled={flashing}
            className={cn(
              "gap-1.5 h-8 rounded-full px-4",
              mode === "flash" && "bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(73,110,214,0.22)]"
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">烧录</span>
          </Button>
        </TooltipWrapper>

        <TooltipWrapper tooltip={<p>RTT 模式 - 实时数据传输和调试 <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-muted rounded">Ctrl+2</kbd></p>}>
          <Button
            variant={mode === "rtt" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("rtt")}
            disabled={flashing}
            className={cn(
              "gap-1.5 h-8 rounded-full px-4",
              mode === "rtt" && "bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(73,110,214,0.22)]"
            )}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">RTT</span>
          </Button>
        </TooltipWrapper>

        <TooltipWrapper tooltip={<p>串口模式 - 串口终端通信 <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-muted rounded">Ctrl+3</kbd></p>}>
          <Button
            variant={mode === "serial" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("serial")}
            disabled={flashing}
            className={cn(
              "gap-1.5 h-8 rounded-full px-4",
              mode === "serial" && "bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(73,110,214,0.22)]"
            )}
          >
            <Plug2 className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">串口</span>
          </Button>
        </TooltipWrapper>
      </div>

      {/* Confirmation dialog when RTT is running */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, targetMode: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认切换模式</DialogTitle>
            <DialogDescription>
              RTT 正在运行中。切换到烧录模式将停止 RTT 数据接收。确定要继续吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, targetMode: null })}
            >
              取消
            </Button>
            <Button onClick={handleConfirmSwitch}>确认切换</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
