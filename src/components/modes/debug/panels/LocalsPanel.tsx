import { PanelShell } from "./PanelShell";

export function LocalsPanel() {
  return <PanelShell title="Locals" hint="当前栈帧的局部变量（阶段 5 接入 DWARF 类型解析）。" />;
}
