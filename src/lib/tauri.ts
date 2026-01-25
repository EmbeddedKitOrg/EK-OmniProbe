import { invoke } from "@tauri-apps/api/core";
import type {
  ProbeInfo,
  ConnectOptions,
  TargetInfo,
  ConnectionStatus,
  ChipInfo,
  FlashOptions,
  FirmwareFileInfo,
  PackInfo,
  ProjectConfig,
  RttConfig,
  RttStartOptions,
  RttStatusEvent,
  RegisterValue,
  FlashAlgorithmInfo,
  EraseMode,
  UsbPermissionStatus,
  UsbDeviceInfo,
} from "./types";

// 探针命令
export async function listProbes(): Promise<ProbeInfo[]> {
  return await invoke<ProbeInfo[]>("list_probes");
}

export async function connectTarget(options: ConnectOptions): Promise<TargetInfo> {
  return await invoke<TargetInfo>("connect_target", { options });
}

export async function disconnect(): Promise<void> {
  return await invoke("disconnect");
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  return await invoke<ConnectionStatus>("get_connection_status");
}

// RTT 独立连接命令
export async function connectRtt(options: ConnectOptions): Promise<TargetInfo> {
  return await invoke<TargetInfo>("connect_rtt", { options });
}

export async function disconnectRtt(): Promise<void> {
  return await invoke("disconnect_rtt");
}

export async function getRttConnectionStatus(): Promise<ConnectionStatus> {
  return await invoke<ConnectionStatus>("get_rtt_connection_status");
}

// Flash命令
export async function flashFirmware(options: FlashOptions): Promise<void> {
  return await invoke("flash_firmware", { options });
}

export async function eraseChip(eraseMode?: EraseMode): Promise<void> {
  return await invoke("erase_chip", { options: eraseMode ? { erase_mode: eraseMode } : null });
}

export async function eraseSector(address: number, size: number): Promise<void> {
  return await invoke("erase_sector", { options: { address, size } });
}

export async function verifyFirmware(filePath: string): Promise<boolean> {
  return await invoke<boolean>("verify_firmware", { filePath });
}

export async function readFlash(address: number, size: number): Promise<number[]> {
  return await invoke<number[]>("read_flash", { options: { address, size } });
}

export async function getFirmwareInfo(filePath: string): Promise<FirmwareFileInfo> {
  return await invoke<FirmwareFileInfo>("get_firmware_info", { filePath });
}

// 内存命令
export async function readMemory(address: number, size: number): Promise<number[]> {
  return await invoke<number[]>("read_memory", { options: { address, size } });
}

export async function writeMemory(address: number, data: number[]): Promise<void> {
  return await invoke("write_memory", { options: { address, data } });
}

export async function readRegisters(): Promise<RegisterValue[]> {
  return await invoke<RegisterValue[]>("read_registers");
}

// RTT命令
export async function startRtt(options: RttStartOptions): Promise<RttConfig> {
  return await invoke<RttConfig>("start_rtt", { options });
}

export async function stopRtt(): Promise<void> {
  return await invoke("stop_rtt");
}

export async function writeRtt(channel: number, data: number[]): Promise<number> {
  return await invoke<number>("write_rtt", { channel, data });
}

export async function getRttStatus(): Promise<RttStatusEvent> {
  return await invoke<RttStatusEvent>("get_rtt_status");
}

export async function clearRttBuffer(): Promise<void> {
  return await invoke("clear_rtt_buffer");
}

// 配置命令
export async function getSupportedChips(): Promise<string[]> {
  return await invoke<string[]>("get_supported_chips");
}

export async function searchChips(query: string): Promise<string[]> {
  return await invoke<string[]>("search_chips", { query });
}

export async function getChipInfo(chipName: string): Promise<ChipInfo> {
  return await invoke<ChipInfo>("get_chip_info", { chipName });
}

export async function initPacks(): Promise<number> {
  return await invoke<number>("init_packs");
}

export async function importPack(packPath: string): Promise<PackInfo> {
  return await invoke<PackInfo>("import_pack", { packPath });
}

export async function listImportedPacks(): Promise<PackInfo[]> {
  return await invoke<PackInfo[]>("list_imported_packs");
}

export async function deletePack(packName: string): Promise<void> {
  return await invoke("delete_pack", { packName });
}

export async function getPackScanReport(packName: string): Promise<any> {
  return await invoke("get_pack_scan_report", { packName });
}

export async function getDevicesWithoutAlgorithm(packName: string): Promise<string[]> {
  return await invoke("get_devices_without_algorithm", { packName });
}

export async function checkOutdatedPacks(): Promise<PackInfo[]> {
  return await invoke("check_outdated_packs");
}

export async function rescanPack(packName: string): Promise<number> {
  return await invoke("rescan_pack", { packName });
}

export async function rescanAllOutdatedPacks(): Promise<string[]> {
  return await invoke("rescan_all_outdated_packs");
}

export async function getFlashAlgorithms(chipName: string): Promise<FlashAlgorithmInfo[]> {
  return await invoke<FlashAlgorithmInfo[]>("get_flash_algorithms", { chipName });
}

export async function saveProjectConfig(config: ProjectConfig, filePath: string): Promise<void> {
  return await invoke("save_project_config", { config, filePath });
}

export async function loadProjectConfig(filePath: string): Promise<ProjectConfig> {
  return await invoke<ProjectConfig>("load_project_config", { filePath });
}

// 串口命令
import type {
  SerialPortInfo,
  SerialConfig,
  SerialStatus,
} from "./serialTypes";

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  return await invoke<SerialPortInfo[]>("list_serial_ports_cmd");
}

export async function connectSerial(config: SerialConfig): Promise<void> {
  return await invoke("connect_serial", { config });
}

export async function disconnectSerial(): Promise<void> {
  return await invoke("disconnect_serial");
}

export async function writeSerial(data: number[]): Promise<number> {
  return await invoke<number>("write_serial", { data });
}

export async function writeSerialString(
  text: string,
  encoding: string,
  lineEnding: string
): Promise<number> {
  return await invoke<number>("write_serial_string", { text, encoding, lineEnding });
}

export async function startSerial(pollInterval?: number): Promise<void> {
  return await invoke("start_serial", { pollInterval });
}

export async function stopSerial(): Promise<void> {
  return await invoke("stop_serial");
}

export async function getSerialStatus(): Promise<SerialStatus> {
  return await invoke<SerialStatus>("get_serial_status");
}

export async function clearSerialBuffer(): Promise<void> {
  return await invoke("clear_serial_buffer");
}

// USB 权限检查命令
export async function checkUsbPermissions(): Promise<UsbPermissionStatus> {
  return await invoke<UsbPermissionStatus>("check_usb_permissions");
}

export async function installUdevRules(): Promise<string> {
  return await invoke<string>("install_udev_rules");
}

export async function getUdevInstallInstructions(): Promise<string> {
  return await invoke<string>("get_udev_install_instructions");
}

export async function diagnoseUsbDevices(): Promise<UsbDeviceInfo[]> {
  return await invoke<UsbDeviceInfo[]>("diagnose_usb_devices");
}

// Pack目录管理命令
export async function getPacksDirectory(): Promise<string> {
  return await invoke<string>("get_packs_directory");
}

export async function setCustomPacksDirectory(path: string | null): Promise<void> {
  return await invoke("set_custom_packs_directory", { path });
}
