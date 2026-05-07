import { PanelShell } from "./PanelShell";

export function RegistersPanel() {
  return <PanelShell title="Registers" hint="CPU 寄存器（阶段 2 接入 probe-rs Core API）。" />;
}
