import { ModeSwitch } from "./ModeSwitch";
import { UpdateChecker } from "../UpdateChecker";
import { useProbeStore } from "@/stores/probeStore";
import { useRttStore } from "@/stores/rttStore";
import { useFlashStore } from "@/stores/flashStore";
import { useChipStore } from "@/stores/chipStore";
import { useAppStore } from "@/stores/appStore";
import { Cpu, FileCode, Loader2 } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-button";

export function TopBar() {
  const { connected, selectedProbe } = useProbeStore();
  const { rttConnected, isRunning: rttRunning, totalBytes } = useRttStore();
  const { flashing, progress, firmwarePath } = useFlashStore();
  const { selectedChip } = useChipStore();
  const { mode } = useAppStore();

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Get firmware filename
  const firmwareFileName = firmwarePath ? firmwarePath.split(/[\\/]/).pop() : null;

  return (
    <header className="flex items-center h-11 px-3 border-b border-border bg-background no-select">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <span className="text-base font-bold text-primary">EK-OmniProbe</span>

        {/* Mode Switch */}
        <ModeSwitch />
      </div>

      {/* Center Status Area */}
      <div className="flex-1 flex items-center justify-center gap-4 text-xs text-muted-foreground">
        {/* Current chip info */}
        {selectedChip && (
          <TooltipWrapper tooltip="当前目标芯片">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50">
              <Cpu className="h-3 w-3" />
              <span className="font-mono text-[11px]">{selectedChip}</span>
            </div>
          </TooltipWrapper>
        )}

        {/* Firmware file (in flash mode) */}
        {mode === "flash" && firmwareFileName && (
          <TooltipWrapper tooltip={<p className="max-w-[300px] break-all">{firmwarePath}</p>}>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 max-w-[180px]">
              <FileCode className="h-3 w-3 flex-shrink-0" />
              <span className="truncate text-[11px]">{firmwareFileName}</span>
            </div>
          </TooltipWrapper>
        )}

        {/* Flashing progress */}
        {flashing && (
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-primary/10">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
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
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-600 text-[11px]">RTT: {formatBytes(totalBytes)}</span>
          </div>
        )}
      </div>

      {/* Right Status Area */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {/* Update Checker */}
        <UpdateChecker />

        {/* RTT Connection Status */}
        {rttConnected && !rttRunning && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-yellow-500/10">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            <span className="text-yellow-600">RTT就绪</span>
          </div>
        )}

        {/* Device Connection Status */}
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${
          connected ? "bg-green-500/10" : "bg-red-500/10"
        }`}>
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
