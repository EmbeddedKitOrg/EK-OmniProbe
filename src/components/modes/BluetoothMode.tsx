import { BluetoothPanel } from "@/components/bluetooth";
import { LogPanel } from "@/components/log/LogPanel";

export function BluetoothMode() {
  return (
    <div className="surface-strong flex h-full flex-col gap-2 overflow-hidden rounded-[14px] p-2">
      <div className="flex-1 overflow-hidden">
        <BluetoothPanel className="h-full" />
      </div>
      <LogPanel />
    </div>
  );
}
