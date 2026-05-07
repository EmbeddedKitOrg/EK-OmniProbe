import { PanelShell } from "./PanelShell";

export function CallStackPanel() {
  return <PanelShell title="Call Stack" hint="调用栈（阶段 3 接入 gimli stack unwind）。" />;
}
