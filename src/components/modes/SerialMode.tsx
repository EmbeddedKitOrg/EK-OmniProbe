import { useSerialEvents } from "@/hooks/useSerialEvents";
import { SerialPanel } from "@/components/serial";
import { LogPanel } from "@/components/log/LogPanel";

export function SerialMode() {
  // Listen to serial events at the mode level
  useSerialEvents();

  return (
    <div className="surface-strong flex h-full flex-col gap-2 overflow-hidden rounded-[34px] p-3">
      <div className="flex-1 overflow-hidden">
        <SerialPanel className="h-full" />
      </div>

      <LogPanel />
    </div>
  );
}
