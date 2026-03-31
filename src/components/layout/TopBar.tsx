import { ModeSwitch } from "./ModeSwitch";
import { UpdateChecker } from "../UpdateChecker";
import { useProbeStore } from "@/stores/probeStore";
import { useRttStore } from "@/stores/rttStore";
import { useFlashStore } from "@/stores/flashStore";
import { useChipStore } from "@/stores/chipStore";
import { useAppStore } from "@/stores/appStore";
import { Activity, Cpu, FileCode, Loader2, Radar, Waves, Wifi } from "lucide-react";
import { TooltipWrapper } from "@/components/ui/tooltip-button";
import { formatBytes } from "@/lib/formatters";
import { SettingsCenterDialog } from "./SettingsCenterDialog";

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

  const modeMeta = {
    flash: { label: "烧录工作台", icon: Cpu },
    rtt: { label: "RTT 调试工作台", icon: Radar },
    serial: { label: "串口工作台", icon: Wifi },
  } as const;

  const ModeIcon = modeMeta[mode].icon;

  return (
    <header className="surface-shell no-select flex flex-col gap-3 rounded-[28px] px-3 py-3 2xl:flex-row 2xl:items-center 2xl:gap-4 2xl:px-4 2xl:py-2.5">
      <div className="flex w-full items-center justify-between gap-3 2xl:w-auto 2xl:flex-shrink-0 2xl:justify-start">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(73,110,214,0.28)] 2xl:h-9 2xl:w-9">
            <Cpu className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-[0.02em] text-primary">EK-OmniProbe</div>
            <div className="hidden text-[11px] text-muted-foreground xl:block 2xl:block">Embedded Toolkit Workspace</div>
          </div>
        </div>

        {/* Mode Switch */}
        <ModeSwitch className="flex-shrink-0" />
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 2xl:flex-1 2xl:flex-nowrap 2xl:gap-3 2xl:px-2">
        <div className="workspace-summary flex min-w-[170px] flex-1 items-center gap-3 rounded-[20px] px-3 py-2 md:min-w-[220px] 2xl:flex-none">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <ModeIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Workspace</div>
            <div className="truncate text-sm font-semibold text-foreground">{modeMeta[mode].label}</div>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground 2xl:flex">
          {selectedChip && (
            <TooltipWrapper tooltip="当前目标芯片">
              <div className="toolbar-chip-strong flex min-w-0 items-center gap-1.5 px-3 py-1.5">
                <Cpu className="h-3 w-3" />
                <span className="truncate font-mono text-[11px]">{selectedChip}</span>
              </div>
            </TooltipWrapper>
          )}

          {selectedProbe && (
            <TooltipWrapper
              tooltip={
                <>
                  <p>{selectedProbe.identifier}</p>
                  {selectedProbe.dap_version && (
                    <p className="text-xs text-muted-foreground">{selectedProbe.dap_version}</p>
                  )}
                </>
              }
            >
              <div className="toolbar-chip flex min-w-0 items-center gap-1.5 px-3 py-1.5">
                <Activity className="h-3 w-3" />
                <span className="max-w-[140px] truncate text-[11px]">{selectedProbe.identifier}</span>
              </div>
            </TooltipWrapper>
          )}

          {mode === "flash" && firmwareFileName && (
            <TooltipWrapper tooltip={<p className="max-w-[300px] break-all">{firmwarePath}</p>}>
              <div className="toolbar-chip flex max-w-[220px] items-center gap-1.5 px-3 py-1.5">
                <FileCode className="h-3 w-3 flex-shrink-0" />
                <span className="truncate text-[11px]">{firmwareFileName}</span>
              </div>
            </TooltipWrapper>
          )}

          {mode === "rtt" && (
            <div className="toolbar-chip flex items-center gap-1.5 px-3 py-1.5">
              <Radar className="h-3 w-3" />
              <span className="text-[11px]">{rttRunning ? `RTT 数据 ${formatBytes(totalBytes)}` : rttConnected ? "RTT 已连接" : "等待 RTT 连接"}</span>
            </div>
          )}

          {mode === "serial" && (
            <div className="toolbar-chip flex items-center gap-1.5 px-3 py-1.5">
              <Waves className="h-3 w-3" />
              <span className="text-[11px]">串口图表与 FFT 已共用同一工作流</span>
            </div>
          )}

          {flashing && (
            <div className="toolbar-chip flex items-center gap-2 px-3 py-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="w-8 text-[10px] font-medium text-primary">{Math.round(progress)}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full items-center justify-end gap-2 text-xs text-muted-foreground 2xl:w-auto 2xl:flex-shrink-0 2xl:gap-3">
        <UpdateChecker showTrigger={false} />
        <SettingsCenterDialog />

        {rttConnected && !rttRunning && (
          <div className="toolbar-chip hidden items-center gap-1.5 px-3 py-1.5 xl:flex">
            <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            <span className="text-yellow-600">RTT就绪</span>
          </div>
        )}

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
      </div>
    </header>
  );
}
