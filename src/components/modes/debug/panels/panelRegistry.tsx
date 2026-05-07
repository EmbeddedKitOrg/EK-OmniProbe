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
  symbols: { id: "symbols", title: "Symbols", Component: SymbolsPanel },
  source: { id: "source", title: "Source", Component: SourceViewPanel },
  registers: { id: "registers", title: "Registers", Component: RegistersPanel },
  locals: { id: "locals", title: "Locals", Component: LocalsPanel },
  watch: { id: "watch", title: "Watch", Component: WatchPanel },
  memory: { id: "memory", title: "Memory", Component: MemoryPanel },
  callStack: { id: "callStack", title: "Call Stack", Component: CallStackPanel },
  breakpoints: { id: "breakpoints", title: "Breakpoints", Component: BreakpointsPanel },
  output: { id: "output", title: "Output", Component: OutputPanel },
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
