import { RttPanel } from "@/components/rtt";
import { LogPanel } from "@/components/log/LogPanel";

export function RttMode() {
  return (
    <div className="surface-strong flex h-full flex-col gap-2 overflow-hidden rounded-[14px] p-2">
      <div className="flex-1 overflow-hidden">
        <RttPanel className="h-full" />
      </div>

      <LogPanel />
    </div>
  );
}
