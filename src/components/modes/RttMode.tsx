import { useRttEvents } from "@/hooks/useRttEvents";
import { RttPanel } from "@/components/rtt";
import { LogPanel } from "@/components/log/LogPanel";

export function RttMode() {
  // Listen to RTT events at the mode level
  useRttEvents();

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden rounded-[34px] surface-strong p-3">
      <div className="flex-1 overflow-hidden">
        <RttPanel className="h-full" />
      </div>

      <LogPanel />
    </div>
  );
}
