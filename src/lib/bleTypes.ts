// 蓝牙类型定义（含 BLE 与经典 SPP）

import type { SerialLine } from "./serialTypes";

/** 蓝牙工作模式 */
export type BluetoothConnectionMode = "ble" | "spp";

export interface BleDeviceInfo {
  id: string;
  address: string;
  name: string | null;
  rssi: number | null;
  connected: boolean;
}

export interface BleCharacteristicProperties {
  read: boolean;
  write: boolean;
  write_without_response: boolean;
  notify: boolean;
  indicate: boolean;
}

export interface BleCharacteristic {
  uuid: string;
  properties: BleCharacteristicProperties;
}

export interface BleService {
  uuid: string;
  characteristics: BleCharacteristic[];
}

export interface NusAutoConfig {
  service_uuid: string;
  notify_char_uuid: string;
  write_char_uuid: string;
}

export interface BleStats {
  bytes_received: number;
  bytes_sent: number;
}

export interface BleStatus {
  connected: boolean;
  running: boolean;
  scanning: boolean;
  device: BleDeviceInfo | null;
  stats: BleStats;
  subscribed_char: string | null;
}

export interface BleDataEvent {
  data: number[];
  timestamp: number;
  direction: "rx" | "tx";
}

export interface BleStatusEvent {
  connected: boolean;
  running: boolean;
  error: string | null;
}

/** 蓝牙日志行（与 SerialLine 同形） */
export type BleLine = SerialLine;

export const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
