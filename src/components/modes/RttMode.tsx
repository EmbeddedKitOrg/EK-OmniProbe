import { useRttEvents } from "@/hooks/useRttEvents";
import { RttPanel } from "@/components/rtt";
import { LogPanel } from "@/components/log/LogPanel";
import { Activity } from "lucide-react";

export function RttMode() {
  // Listen to RTT events at the mode level
  useRttEvents();

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[34px] surface-strong p-3">
      <section className="mb-3 flex flex-wrap items-center gap-2 rounded-[20px] border border-border/60 bg-white/70 px-4 py-2.5 shadow-[0_10px_20px_rgba(73,93,142,0.06)] backdrop-blur">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Activity className="h-3.5 w-3.5" />
          RTT 工作台
        </div>
        <p className="text-sm text-muted-foreground">
          连接 RTT 后可直接用工具栏进入“智能启用 / 波形 / FFT”。
        </p>
      </section>

      {/* RTT Panel */}
      <div className="flex-1 overflow-hidden">
        <RttPanel className="h-full" />
      </div>

      {/* System Log Panel - shows connection errors, etc. */}
      <LogPanel />
    </div>
  );
}
