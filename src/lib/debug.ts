import { invoke } from "@tauri-apps/api/core";
import type { ConnectOptions, ConnectionInfo } from "./types";

export interface DebugAttachOptions extends ConnectOptions {
  halt_after_attach?: boolean;
}

export interface DebugCoreState {
  state: "halted" | "running";
  pc: number | null;
}

export interface DebugStatus {
  attached: boolean;
  info: ConnectionInfo | null;
  core: DebugCoreState | null;
}

export interface DebugRegisterValue {
  name: string;
  value: number;
}

// Attach / Detach
export async function debugAttach(options: DebugAttachOptions): Promise<DebugStatus> {
  return await invoke<DebugStatus>("debug_attach", { options });
}

export async function debugDetach(): Promise<void> {
  return await invoke("debug_detach");
}

export async function debugGetStatus(): Promise<DebugStatus> {
  return await invoke<DebugStatus>("debug_get_status");
}

// 执行控制
export async function debugRun(): Promise<DebugCoreState> {
  return await invoke<DebugCoreState>("debug_run");
}

export async function debugHalt(): Promise<DebugCoreState> {
  return await invoke<DebugCoreState>("debug_halt");
}

export async function debugStepIn(): Promise<DebugCoreState> {
  return await invoke<DebugCoreState>("debug_step_in");
}

export async function debugReset(): Promise<DebugCoreState> {
  return await invoke<DebugCoreState>("debug_reset");
}

export async function debugResetHalt(): Promise<DebugCoreState> {
  return await invoke<DebugCoreState>("debug_reset_halt");
}

// 内存读写
export async function debugReadMemory(address: number, size: number): Promise<number[]> {
  return await invoke<number[]>("debug_read_memory", { options: { address, size } });
}

export async function debugWriteMemory(address: number, data: number[]): Promise<void> {
  return await invoke("debug_write_memory", { options: { address, data } });
}

// 寄存器读写
export async function debugReadRegisters(): Promise<DebugRegisterValue[]> {
  return await invoke<DebugRegisterValue[]>("debug_read_registers");
}

export async function debugWriteRegister(name: string, value: number): Promise<void> {
  return await invoke("debug_write_register", { options: { name, value } });
}
