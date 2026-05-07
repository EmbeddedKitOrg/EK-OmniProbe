import { PanelShell } from "./PanelShell";

export function SymbolsPanel() {
  return <PanelShell title="Symbols" hint="ELF 加载后会展示函数和全局变量列表（阶段 3 接入 DWARF 解析）。" />;
}
