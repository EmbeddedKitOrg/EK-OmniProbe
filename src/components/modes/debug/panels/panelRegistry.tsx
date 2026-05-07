import type { ComponentType } from "react";
import type { PanelId } from "@/stores/debugStore";
import { SymbolsPanel } from "./SymbolsPanel";
import { SourceViewPanel } from "./SourceViewPanel";
import { RegistersPanel } from "./RegistersPanel";
import { LocalsPanel } from "./LocalsPanel";
import { WatchPanel } from "./WatchPanel";
import { MemoryPanel } from "./MemoryPanel";
import { CallStackPanel } from "./CallStackPanel";
import { BreakpointsPanel } from "./BreakpointsPanel";
import { OutputPanel } from "./OutputPanel";

export interface PanelMeta {
  id: PanelId;
  title: string;
  Component: ComponentType;
}

export const PANEL_REGISTRY: Record<PanelId, PanelMeta> = {
  symbols: { id: "symbols", title: "符号", Component: SymbolsPanel },
  source: { id: "source", title: "源码", Component: SourceViewPanel },
  registers: { id: "registers", title: "寄存器", Component: RegistersPanel },
  locals: { id: "locals", title: "全局变量", Component: LocalsPanel },
  watch: { id: "watch", title: "观察", Component: WatchPanel },
  memory: { id: "memory", title: "内存", Component: MemoryPanel },
  callStack: { id: "callStack", title: "调用栈", Component: CallStackPanel },
  breakpoints: { id: "breakpoints", title: "断点", Component: BreakpointsPanel },
  output: { id: "output", title: "输出", Component: OutputPanel },
};

export const PANEL_ORDER: PanelId[] = [
  "symbols",
  "source",
  "registers",
  "locals",
  "watch",
  "memory",
  "callStack",
  "breakpoints",
  "output",
];
