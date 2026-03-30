import { ModeSwitch } from "./ModeSwitch";
import { UpdateChecker } from "../UpdateChecker";
import { useProbeStore } from "@/stores/probeStore";
import { useRttStore } from "@/stores/rttStore";
import { useFlashStore } from "@/stores/flashStore";
import { useChipStore } from "@/stores/chipStore";
import { useAppStore } from "@/stores/appStore";
import { Cpu, FileCode, Loader2 } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-button";
import { formatBytes } from "@/lib/formatters";
import { ThemeSchemeDialog } from "./ThemeSchemeDialog";

export function TopBar() {
  const connected = useProbeStore((s) => s.connected);
  const selectedProbe = useProbeStore((s) => s.selectedProbe);
  const rttConnected = useRttStore((s) => s.rttConnected);
  const rttRunning = useRttStore((s) => s.isRunning);
  const totalBytes = useRttStore((s) => s.totalBytes);
  const flashing = useFlashStore((s) => s.flashing);
  const progress = useFlashStore((s) => s.progress);
  const firmwarePath = useFlashStore((s) => s.firmwarePath);
  const selectedChip = useChipStore((s) => s.selectedChip);
  const mode = useAppStore((s) => s.mode);

  // Get firmware filename
  const firmwareFileName = firmwarePath ? firmwarePath.split(/[\\/]/).pop() : null;

  return (
    <header className="surface-shell no-select flex h-14 items-center rounded-[28px] px-4">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(73,110,214,0.28)]">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[0.02em] text-primary">EK-OmniProbe</div>
            <div className="text-[11px] text-muted-foreground">Embedded Toolkit Workspace</div>
          </div>
        </div>

        {/* Mode Switch */}
        <ModeSwitch />
      </div>

      {/* Center Status Area */}
      <div className="flex flex-1 items-center justify-center gap-3 px-4 text-xs text-muted-foreground">
        {/* Current chip info */}
        {selectedChip && (
          <TooltipWrapper tooltip="当前目标芯片">
            <div className="toolbar-chip flex items-center gap-1.5 px-3 py-1.5">
              <Cpu className="h-3 w-3" />
              <span className="font-mono text-[11px]">{selectedChip}</span>
            </div>
          </TooltipWrapper>
        )}

        {/* Firmware file (in flash mode) */}
        {mode === "flash" && firmwareFileName && (
          <TooltipWrapper tooltip={<p className="max-w-[300px] break-all">{firmwarePath}</p>}>
            <div className="toolbar-chip flex max-w-[220px] items-center gap-1.5 px-3 py-1.5">
              <FileCode className="h-3 w-3 flex-shrink-0" />
              <span className="truncate text-[11px]">{firmwareFileName}</span>
            </div>
          </TooltipWrapper>
        )}

        {/* Flashing progress */}
        {flashing && (
          <div className="toolbar-chip flex items-center gap-2 px-3 py-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-primary font-medium w-8">{Math.round(progress)}%</span>
          </div>
        )}

        {/* RTT data rate (in RTT mode when running) */}
        {mode === "rtt" && rttRunning && (
          <div className="toolbar-chip flex items-center gap-1.5 px-3 py-1.5">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            <span className="text-green-600 text-[11px]">RTT: {formatBytes(totalBytes)}</span>
          </div>
        )}
      </div>

      {/* Right Status Area */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {/* Update Checker */}
        <UpdateChecker />
        <ThemeSchemeDialog />

        {/* RTT Connection Status */}
        {rttConnected && !rttRunning && (
          <div className="toolbar-chip flex items-center gap-1.5 px-3 py-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            <span className="text-yellow-600">RTT就绪</span>
          </div>
        )}

        {/* Device Connection Status */}
        <div className="toolbar-chip flex items-center gap-1.5 px-3 py-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className={connected ? "text-green-600" : "text-red-500"}>
            {connected ? "已连接" : "未连接"}
          </span>
        </div>

        {/* Probe info when connected */}
        {connected && selectedProbe && (
          <TooltipWrapper
            tooltip={
              <>
                <p>{selectedProbe.identifier}</p>
                {selectedProbe.dap_version && <p className="text-xs text-muted-foreground">{selectedProbe.dap_version}</p>}
              </>
            }
          >
            <span className="text-[10px] text-muted-foreground/70 max-w-[100px] truncate">
              {selectedProbe.identifier.split(" ")[0]}
            </span>
          </TooltipWrapper>
        )}
      </div>
    </header>
  );
}
