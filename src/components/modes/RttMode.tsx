import { useRttEvents } from "@/hooks/useRttEvents";
import { RttPanel } from "@/components/rtt";
import { LogPanel } from "@/components/log/LogPanel";

export function RttMode() {
  // Listen to RTT events at the mode level
  useRttEvents();

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[34px] surface-strong p-3">
      {/* RTT Panel */}
      <div className="flex-1 overflow-hidden">
        <RttPanel className="h-full" />
      </div>

      {/* System Log Panel - shows connection errors, etc. */}
      <LogPanel />
    </div>
  );
}
