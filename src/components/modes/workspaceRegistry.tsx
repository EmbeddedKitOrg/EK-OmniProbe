import type { ComponentType } from "react";
import {
  Bluetooth,
  Bug,
  Cpu,
  FileSearch,
  LayoutDashboard,
  Plug2,
  Radar,
  Terminal,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { WORKSPACES, type AppMode } from "@/lib/workspaces";
import { BluetoothMode } from "./BluetoothMode";
import { ControlPanelMode } from "./ControlPanelMode";
import { DebugMode } from "./DebugMode";
import { FlashMode } from "./FlashMode";
import { LogAnalysisMode } from "./LogAnalysisMode";
import { RttMode } from "./RttMode";
import { SerialMode } from "./SerialMode";

interface WorkspaceUi {
  navigationIcon: LucideIcon;
  headerIcon: LucideIcon;
  view: ComponentType;
}

const WORKSPACE_UI: Record<AppMode, WorkspaceUi> = {
  flash: { navigationIcon: Zap, headerIcon: Cpu, view: FlashMode },
  rtt: { navigationIcon: Terminal, headerIcon: Radar, view: RttMode },
  serial: { navigationIcon: Plug2, headerIcon: Wifi, view: SerialMode },
  "log-analysis": { navigationIcon: FileSearch, headerIcon: FileSearch, view: LogAnalysisMode },
  bluetooth: { navigationIcon: Bluetooth, headerIcon: Bluetooth, view: BluetoothMode },
  "control-panel": { navigationIcon: LayoutDashboard, headerIcon: LayoutDashboard, view: ControlPanelMode },
  debug: { navigationIcon: Bug, headerIcon: Bug, view: DebugMode },
};

export const WORKSPACE_REGISTRY = WORKSPACES.map((workspace) => ({ ...workspace, ...WORKSPACE_UI[workspace.id] }));

export const WORKSPACE_BY_MODE = Object.fromEntries(
  WORKSPACE_REGISTRY.map((workspace) => [workspace.id, workspace])
) as Record<AppMode, (typeof WORKSPACE_REGISTRY)[number]>;
