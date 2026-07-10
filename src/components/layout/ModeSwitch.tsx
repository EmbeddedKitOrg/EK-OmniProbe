import { Zap, Terminal, Plug2, Bluetooth, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-button";
import { useAppStore, type AppMode } from "@/stores/appStore";
import { useRttStore } from "@/stores/rttStore";
import { useFlashStore } from "@/stores/flashStore";
import { useDebugStore } from "@/stores/debugStore";
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
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const rttRunning = useRttStore((state) => state.isRunning);
  const flashing = useFlashStore((state) => state.flashing);
  const debugAttached = useDebugStore((s) => s.state) !== "detached";
  type ConfirmReason = "rtt" | "debug";
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    targetMode: AppMode | null;
    reason: ConfirmReason | null;
  }>({
    open: false,
    targetMode: null,
    reason: null,
  });

  const handleModeChange = (newMode: AppMode) => {
    if (newMode === mode) return;

    // RTT 运行 → 烧录：旧的保护
    if (rttRunning && newMode === "flash") {
      setConfirmDialog({ open: true, targetMode: newMode, reason: "rtt" });
      return;
    }

    // 调试已 attached → 切去任意非调试模式：提示「调试会话仍在，会占着探针」
    if (debugAttached && mode === "debug" && newMode !== "debug") {
      setConfirmDialog({ open: true, targetMode: newMode, reason: "debug" });
      return;
    }

    // 烧录中不允许切换
    if (flashing) {
      return;
    }

    setMode(newMode);
  };

  const handleConfirmSwitch = () => {
    if (confirmDialog.targetMode) {
      setMode(confirmDialog.targetMode);
    }
    setConfirmDialog({ open: false, targetMode: null, reason: null });
  };

  const dialogText =
    confirmDialog.reason === "debug"
      ? "调试会话仍在 attach 状态。切换工作台不会自动 Detach；如果你想用同一探针给其他模式连接，请先回到调试工作台点 Detach。确定继续？"
      : "RTT 正在运行。切换到烧录模式会停止 RTT 数据接收，确定继续吗？";

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 rounded-full border border-border/60 bg-white/78 p-1 shadow-[0_8px_20px_rgba(73,93,142,0.12)] backdrop-blur",
          className
        )}
      >
        <TooltipWrapper
          tooltip={
            <p>
              烧录模式 - 固件烧录、擦除、校验{" "}
              <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-muted rounded">Ctrl+1</kbd>
            </p>
          }
        >
          <Button
            variant={mode === "flash" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("flash")}
            disabled={flashing}
            className={cn(
              "h-8 gap-1 rounded-full px-3 xl:px-3.5",
              mode === "flash" && "bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(73,110,214,0.22)]"
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">烧录</span>
          </Button>
        </TooltipWrapper>

        <TooltipWrapper
          tooltip={
            <p>
              RTT 模式 - 实时调试输出与数据图表{" "}
              <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-muted rounded">Ctrl+2</kbd>
            </p>
          }
        >
          <Button
            variant={mode === "rtt" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("rtt")}
            disabled={flashing}
            className={cn(
              "h-8 gap-1 rounded-full px-3 xl:px-3.5",
              mode === "rtt" && "bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(73,110,214,0.22)]"
            )}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">RTT</span>
          </Button>
        </TooltipWrapper>

        <TooltipWrapper
          tooltip={
            <p>
              串口模式 - 串口终端通信 <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-muted rounded">Ctrl+3</kbd>
            </p>
          }
        >
          <Button
            variant={mode === "serial" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("serial")}
            disabled={flashing}
            className={cn(
              "h-8 gap-1 rounded-full px-3 xl:px-3.5",
              mode === "serial" && "bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(73,110,214,0.22)]"
            )}
          >
            <Plug2 className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">串口</span>
          </Button>
        </TooltipWrapper>

        <TooltipWrapper
          tooltip={
            <p>
              蓝牙 BLE 模式 - 扫描、连接、收发与绘图{" "}
              <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-muted rounded">Ctrl+4</kbd>
            </p>
          }
        >
          <Button
            variant={mode === "bluetooth" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("bluetooth")}
            disabled={flashing}
            className={cn(
              "h-8 gap-1 rounded-full px-3 xl:px-3.5",
              mode === "bluetooth" && "bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(73,110,214,0.22)]"
            )}
          >
            <Bluetooth className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">蓝牙</span>
          </Button>
        </TooltipWrapper>

        <TooltipWrapper
          tooltip={
            <p>
              调试模式 - 源码级断点、单步、寄存器/内存查看{" "}
              <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-muted rounded">Ctrl+5</kbd>
            </p>
          }
        >
          <Button
            variant={mode === "debug" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("debug")}
            disabled={flashing}
            className={cn(
              "h-8 gap-1 rounded-full px-3 xl:px-3.5",
              mode === "debug" && "bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(73,110,214,0.22)]"
            )}
          >
            <Bug className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">调试</span>
          </Button>
        </TooltipWrapper>
      </div>

      {/* 切换工作台前的确认弹窗（RTT 运行 / 调试已 attached） */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, targetMode: null, reason: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认切换模式</DialogTitle>
            <DialogDescription>{dialogText}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, targetMode: null, reason: null })}>
              取消
            </Button>
            <Button onClick={handleConfirmSwitch}>确认切换</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
