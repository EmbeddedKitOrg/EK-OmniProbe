import { PanelShell } from "./PanelShell";

export function OutputPanel() {
  return <PanelShell title="Output" hint="调试输出与事件（阶段 2 起接入全局 logStore）。" />;
}
