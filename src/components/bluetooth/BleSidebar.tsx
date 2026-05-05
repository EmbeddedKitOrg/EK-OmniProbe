import { useState, useCallback } from "react";
import { RefreshCw, Bluetooth, Sparkles, Radio, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useBluetoothStore, pickDefaultNotifyChar, pickDefaultWriteChar } from "@/stores/bluetoothStore";
import { useBluetoothStats } from "@/hooks/useBluetoothEvents";
import { useLogStore } from "@/stores/logStore";
import {
  bleStartScan,
  bleStopScan,
  bleConnect,
  bleDisconnect,
  bleListServices,
  bleDetectNus,
  bleSubscribe,
  bleUnsubscribe,
} from "@/lib/tauri";
import type { BleCharacteristic, BleDeviceInfo } from "@/lib/bleTypes";
import { cn } from "@/lib/utils";

const SCAN_TIMEOUT_MS = 6000;

export function BleSidebar() {
  const {
    scanning,
    connecting,
    connected,
    running,
    discoveredDevices,
    connectedDevice,
    services,
    notifyCharUuid,
    writeCharUuid,
    setScanning,
    setConnecting,
    setConnected,
    setRunning,
    setError,
    setDiscoveredDevices,
    setConnectedDevice,
    setServices,
    setNotifyCharUuid,
    setWriteCharUuid,
  } = useBluetoothStore();

  const stats = useBluetoothStats();
  const addLog = useLogStore((s) => s.addLog);

  const [busy, setBusy] = useState(false);

  const handleScan = useCallback(async () => {
    if (scanning) {
      try {
        await bleStopScan();
      } catch (error) {
        addLog("warn", `停止扫描失败: ${error}`);
      }
      setScanning(false);
      return;
    }

    try {
      setScanning(true);
      addLog("info", "开始扫描 BLE 设备...");
      const devices = await bleStartScan(SCAN_TIMEOUT_MS);
      setDiscoveredDevices(devices);
      addLog("success", `扫描完成，发现 ${devices.length} 个设备`);
    } catch (error) {
      addLog("error", `扫描失败: ${error}`);
    } finally {
      setScanning(false);
    }
  }, [addLog, scanning, setDiscoveredDevices, setScanning]);

  const loadServicesAfterConnect = useCallback(async () => {
    try {
      const list = await bleListServices();
      setServices(list);

      // 优先识别 NUS
      try {
        const nus = await bleDetectNus();
        if (nus) {
          setNotifyCharUuid(nus.notify_char_uuid);
          setWriteCharUuid(nus.write_char_uuid);
          addLog("success", "已自动识别 Nordic UART Service");
          return;
        }
      } catch {
        /* ignore */
      }

      // 否则按属性挑默认
      const defNotify = pickDefaultNotifyChar(list);
      const defWrite = pickDefaultWriteChar(list);
      if (defNotify) setNotifyCharUuid(defNotify);
      if (defWrite) setWriteCharUuid(defWrite);
    } catch (error) {
      addLog("error", `获取服务失败: ${error}`);
    }
  }, [addLog, setNotifyCharUuid, setServices, setWriteCharUuid]);

  const handleConnect = useCallback(
    async (device: BleDeviceInfo) => {
      try {
        setConnecting(true);
        addLog("info", `连接 ${device.name || device.address}...`);
        const info = await bleConnect(device.id);
        setConnectedDevice(info);
        setConnected(true);
        addLog("success", `已连接 ${info.name || info.address}`);
        await loadServicesAfterConnect();
      } catch (error) {
        addLog("error", `连接失败: ${error}`);
        setError(String(error));
      } finally {
        setConnecting(false);
      }
    },
    [addLog, loadServicesAfterConnect, setConnected, setConnectedDevice, setConnecting, setError]
  );

  const handleDisconnect = useCallback(async () => {
    try {
      setBusy(true);
      if (running) {
        await bleUnsubscribe();
        setRunning(false);
      }
      await bleDisconnect();
      setConnected(false);
      setConnectedDevice(null);
      setServices([]);
      setNotifyCharUuid(null);
      setWriteCharUuid(null);
      addLog("info", "BLE 已断开");
    } catch (error) {
      addLog("error", `断开失败: ${error}`);
    } finally {
      setBusy(false);
    }
  }, [
    addLog,
    running,
    setConnected,
    setConnectedDevice,
    setNotifyCharUuid,
    setRunning,
    setServices,
    setWriteCharUuid,
  ]);

  const handleStartNotify = useCallback(async () => {
    if (!notifyCharUuid) {
      addLog("error", "请先选择一个 Notify 特征值");
      return;
    }
    try {
      setBusy(true);
      await bleSubscribe(notifyCharUuid);
      setRunning(true);
      addLog("success", "已开始接收 BLE 数据");
    } catch (error) {
      addLog("error", `订阅失败: ${error}`);
    } finally {
      setBusy(false);
    }
  }, [addLog, notifyCharUuid, setRunning]);

  const handleStopNotify = useCallback(async () => {
    try {
      setBusy(true);
      await bleUnsubscribe();
      setRunning(false);
      addLog("info", "已停止 BLE 数据接收");
    } catch (error) {
      addLog("error", `取消订阅失败: ${error}`);
    } finally {
      setBusy(false);
    }
  }, [addLog, setRunning]);

  return (
    <aside className="surface-sidebar w-72 space-y-3 overflow-y-auto rounded-[32px] p-4">
      {/* 扫描卡片 */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">设备扫描</CardTitle>
              <CardDescription className="text-xs">
                {scanning
                  ? "正在扫描..."
                  : `已发现 ${discoveredDevices.length} 台 BLE 设备`}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={scanning ? "destructive" : "outline"}
              className="h-7 gap-1 rounded-full px-3 text-xs"
              onClick={handleScan}
              disabled={connecting}
            >
              {scanning ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  停止
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  扫描
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {discoveredDevices.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-border/70 bg-white/40 px-3 py-4 text-center text-xs text-muted-foreground">
              点击「扫描」开始查找附近的 BLE 设备
            </div>
          ) : (
            discoveredDevices.map((device) => {
              const isConnected = connectedDevice?.id === device.id;
              return (
                <button
                  key={device.id}
                  onClick={() => !isConnected && handleConnect(device)}
                  disabled={connecting || isConnected}
                  className={cn(
                    "group flex w-full items-center justify-between gap-2 rounded-[18px] border px-3 py-2 text-left transition-colors",
                    isConnected
                      ? "border-primary bg-primary/8 text-foreground"
                      : "border-border/60 bg-white/65 hover:border-primary/50 hover:bg-primary/5"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Bluetooth className="h-3.5 w-3.5 text-primary" />
                      <span className="truncate text-xs font-medium">
                        {device.name || "(无名)"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {device.address || device.id}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {device.rssi !== null && (
                      <div className="text-[10px] text-muted-foreground">
                        {device.rssi} dBm
                      </div>
                    )}
                    {isConnected && (
                      <div className="text-[10px] font-medium text-primary">已连接</div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* 已连接设备 + 特征值选择 */}
      {connected && connectedDevice && (
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm">特征值</CardTitle>
            <CardDescription className="text-xs">
              共 {services.length} 个服务，选择 Notify / Write 特征值
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {services.length === 0 ? (
              <div className="text-xs text-muted-foreground">未发现服务</div>
            ) : (
              services.map((service) => (
                <div key={service.uuid} className="space-y-1">
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {shortUuid(service.uuid)}
                  </div>
                  <div className="space-y-1 pl-2">
                    {service.characteristics.map((c) => (
                      <CharRow
                        key={c.uuid}
                        char={c}
                        isNotify={c.uuid === notifyCharUuid}
                        isWrite={c.uuid === writeCharUuid}
                        onSelectNotify={() => setNotifyCharUuid(c.uuid)}
                        onSelectWrite={() => setWriteCharUuid(c.uuid)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* 操作按钮 */}
      {connected && (
        <div className="flex flex-col gap-2">
          {!running ? (
            <Button
              className="w-full rounded-full"
              onClick={handleStartNotify}
              disabled={busy || !notifyCharUuid}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              开始接收 (Notify)
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={handleStopNotify}
              disabled={busy}
            >
              停止接收
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/15"
            onClick={handleDisconnect}
            disabled={busy}
          >
            断开 BLE 设备
          </Button>
        </div>
      )}

      {/* 统计 */}
      {connected && (
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm">统计信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <Stat label="接收" value={stats.bytesReceivedFormatted} />
            <Stat label="发送" value={stats.bytesSentFormatted} />
            <Stat label="行数" value={String(stats.lineCount)} />
          </CardContent>
        </Card>
      )}
    </aside>
  );
}

function shortUuid(uuid: string): string {
  // 标准 16-bit 蓝牙 UUID 形如 0000xxxx-0000-1000-8000-00805f9b34fb
  const m = uuid.match(/^0000([0-9a-fA-F]{4})-0000-1000-8000-00805f9b34fb$/);
  if (m) return `0x${m[1].toUpperCase()} (16-bit)`;
  return uuid;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

interface CharRowProps {
  char: BleCharacteristic;
  isNotify: boolean;
  isWrite: boolean;
  onSelectNotify: () => void;
  onSelectWrite: () => void;
}

function CharRow({ char, isNotify, isWrite, onSelectNotify, onSelectWrite }: CharRowProps) {
  const canNotify = char.properties.notify || char.properties.indicate;
  const canWrite = char.properties.write || char.properties.write_without_response;

  return (
    <div
      className={cn(
        "rounded-[14px] border px-2 py-1.5 text-[11px]",
        isNotify || isWrite
          ? "border-primary/60 bg-primary/5"
          : "border-border/60 bg-white/55"
      )}
    >
      <div className="truncate font-mono text-[10px] text-foreground">{shortUuid(char.uuid)}</div>
      <div className="mt-1 flex items-center gap-1">
        {char.properties.read && <Tag>R</Tag>}
        {char.properties.write && <Tag>W</Tag>}
        {char.properties.write_without_response && <Tag>WnR</Tag>}
        {char.properties.notify && <Tag>Notify</Tag>}
        {char.properties.indicate && <Tag>Indicate</Tag>}
      </div>
      <div className="mt-1.5 flex gap-1">
        <Button
          size="sm"
          variant={isNotify ? "default" : "ghost"}
          className="h-6 gap-1 rounded-full px-2 text-[10px]"
          onClick={onSelectNotify}
          disabled={!canNotify}
        >
          <Radio className="h-3 w-3" />
          作为 Notify
        </Button>
        <Button
          size="sm"
          variant={isWrite ? "default" : "ghost"}
          className="h-6 gap-1 rounded-full px-2 text-[10px]"
          onClick={onSelectWrite}
          disabled={!canWrite}
        >
          <Edit3 className="h-3 w-3" />
          作为 Write
        </Button>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-secondary-foreground">
      {children}
    </span>
  );
}
