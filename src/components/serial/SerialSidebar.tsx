import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ChevronDown, ChevronRight, Plug2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useSerialStore } from "@/stores/serialStore";
import { useSerialStats } from "@/hooks/useSerialEvents";
import { useLogStore } from "@/stores/logStore";
import { listSerialPorts, connectSerial, disconnectSerial, startSerial, stopSerial } from "@/lib/tauri";
import { COMMON_BAUD_RATES, type SerialPortInfo, type DataSourceType } from "@/lib/serialTypes";

export function SerialSidebar() {
  const {
    connected,
    connecting,
    running,
    localConfig,
    tcpConfig,
    activeSourceType,
    sendSettings,
    setConnected,
    setConnecting,
    setRunning,
    setError,
    setLocalConfig,
    setTcpConfig,
    setActiveSourceType,
    setSendSettings,
    getActiveConfig,
  } = useSerialStore();

  const stats = useSerialStats();
  const addLog = useLogStore((state) => state.addLog);

  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [serialSettingsOpen, setSerialSettingsOpen] = useState(false);
  const [sendSettingsOpen, setSendSettingsOpen] = useState(false);

  // Refresh port list
  const refreshPorts = useCallback(async () => {
    try {
      setLoading(true);
      const portList = await listSerialPorts();
      setPorts(portList);

      // Auto-select first port if none selected
      if (portList.length > 0 && !localConfig.port) {
        setLocalConfig({ port: portList[0].name });
      }

      if (portList.length > 0) {
        addLog("info", `检测到 ${portList.length} 个串口`);
      }
    } catch (error) {
      addLog("error", `串口检测失败: ${error}`);
    } finally {
      setLoading(false);
    }
  }, [localConfig.port, setLocalConfig, addLog]);

  useEffect(() => {
    refreshPorts();
  }, []);

  // Connect/Disconnect
  const handleConnect = async () => {
    try {
      setConnecting(true);
      const config = getActiveConfig();

      if (activeSourceType === "local" && !localConfig.port) {
        addLog("error", "请先选择串口");
        return;
      }

      addLog("info", `正在连接 ${activeSourceType === "local" ? localConfig.port : `${tcpConfig.host}:${tcpConfig.port}`}...`);

      await connectSerial(config);
      setConnected(true);

      // Start polling automatically
      await startSerial(10);
      setRunning(true);

      addLog("success", `串口连接成功`);
    } catch (error) {
      addLog("error", `连接失败: ${error}`);
      setError(String(error));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (running) {
        await stopSerial();
        setRunning(false);
      }
      await disconnectSerial();
      setConnected(false);
      addLog("info", "串口已断开");
    } catch (error) {
      addLog("error", `断开失败: ${error}`);
    }
  };

  return (
    <aside className="surface-sidebar w-72 overflow-y-auto rounded-[32px] p-3 space-y-3">
      {/* Data Source Selection */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">数据源</CardTitle>
          <CardDescription className="text-xs">
            {activeSourceType === "local"
              ? (localConfig.port || "本地串口未选择")
              : `${tcpConfig.host}:${tcpConfig.port}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RadioGroup
            value={activeSourceType}
            onValueChange={(value) => setActiveSourceType(value as DataSourceType)}
            disabled={connected}
            className="space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="local" id="local" />
              <Label htmlFor="local" className="flex items-center gap-2 cursor-pointer">
                <Plug2 className="h-4 w-4" />
                本地串口
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="tcp" id="tcp" />
              <Label htmlFor="tcp" className="flex items-center gap-2 cursor-pointer">
                <Wifi className="h-4 w-4" />
                TCP 远程串口
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Local Serial Config */}
      {activeSourceType === "local" && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">串口配置</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  {localConfig.port ? `${localConfig.port} · ${localConfig.baud_rate} bps` : "选择端口并确认波特率"}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={refreshPorts}
                disabled={loading || connected}
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">串口</label>
              <Select
                value={localConfig.port}
                onValueChange={(value) => setLocalConfig({ port: value })}
                disabled={connected}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择串口" />
                </SelectTrigger>
                <SelectContent>
                  {ports.map((port) => (
                    <SelectItem key={port.name} value={port.name}>
                      <div className="flex flex-col">
                        <span>{port.name}</span>
                        {port.description && (
                          <span className="text-xs text-muted-foreground">
                            {port.description}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">波特率</label>
              <Select
                value={String(localConfig.baud_rate)}
                onValueChange={(value) => setLocalConfig({ baud_rate: parseInt(value) })}
                disabled={connected}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_BAUD_RATES.map((rate) => (
                    <SelectItem key={rate} value={String(rate)}>
                      {rate.toLocaleString()} bps
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Local Serial Advanced Settings */}
      {activeSourceType === "local" && (
        <Collapsible open={serialSettingsOpen} onOpenChange={setSerialSettingsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="py-3 cursor-pointer hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">高级设置</CardTitle>
                    <CardDescription className="mt-1 text-xs">
                      {localConfig.data_bits}-{localConfig.stop_bits}-{localConfig.parity} · {localConfig.flow_control}
                    </CardDescription>
                  </div>
                  {serialSettingsOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">数据位</label>
                  <Select
                    value={String(localConfig.data_bits)}
                    onValueChange={(value) => setLocalConfig({ data_bits: parseInt(value) as 5 | 6 | 7 | 8 })}
                    disabled={connected}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 位</SelectItem>
                      <SelectItem value="6">6 位</SelectItem>
                      <SelectItem value="7">7 位</SelectItem>
                      <SelectItem value="8">8 位</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">停止位</label>
                  <Select
                    value={String(localConfig.stop_bits)}
                    onValueChange={(value) => setLocalConfig({ stop_bits: parseInt(value) as 1 | 2 })}
                    disabled={connected}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 位</SelectItem>
                      <SelectItem value="2">2 位</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">校验位</label>
                  <Select
                    value={localConfig.parity}
                    onValueChange={(value) => setLocalConfig({ parity: value as "none" | "even" | "odd" })}
                    disabled={connected}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无</SelectItem>
                      <SelectItem value="even">偶校验</SelectItem>
                      <SelectItem value="odd">奇校验</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">流控</label>
                  <Select
                    value={localConfig.flow_control}
                    onValueChange={(value) => setLocalConfig({ flow_control: value as "none" | "hardware" | "software" })}
                    disabled={connected}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无</SelectItem>
                      <SelectItem value="hardware">硬件 (RTS/CTS)</SelectItem>
                      <SelectItem value="software">软件 (XON/XOFF)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* TCP Config */}
      {activeSourceType === "tcp" && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">TCP 配置</CardTitle>
            <CardDescription className="text-xs">
              适合 ser2net、ESP-Link 等远程串口桥接场景。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">主机地址</label>
              <Input
                value={tcpConfig.host}
                onChange={(e) => setTcpConfig({ host: e.target.value })}
                placeholder="192.168.1.1"
                disabled={connected}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">端口号</label>
              <Input
                type="number"
                value={tcpConfig.port}
                onChange={(e) => setTcpConfig({ port: parseInt(e.target.value) || 0 })}
                placeholder="8080"
                disabled={connected}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Send Settings */}
      <Collapsible open={sendSettingsOpen} onOpenChange={setSendSettingsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer hover:bg-accent/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">发送设置</CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    {sendSettings.hexMode ? "Hex" : sendSettings.encoding} · {sendSettings.lineEnding.toUpperCase()}
                  </CardDescription>
                </div>
                {sendSettingsOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">编码</label>
                <Select
                  value={sendSettings.encoding}
                  onValueChange={(value) => setSendSettings({ encoding: value as "utf-8" | "ascii" | "gbk" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utf-8">UTF-8</SelectItem>
                    <SelectItem value="ascii">ASCII</SelectItem>
                    <SelectItem value="gbk">GBK</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">换行符</label>
                <Select
                  value={sendSettings.lineEnding}
                  onValueChange={(value) => setSendSettings({ lineEnding: value as "none" | "lf" | "crlf" | "cr" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无</SelectItem>
                    <SelectItem value="lf">LF (\n)</SelectItem>
                    <SelectItem value="crlf">CRLF (\r\n)</SelectItem>
                    <SelectItem value="cr">CR (\r)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Connect Button */}
      <Button
        className={`w-full transition-all ${
          connected
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-primary hover:bg-primary/90"
        } ${connecting && "animate-pulse"}`}
        onClick={connected ? handleDisconnect : handleConnect}
        disabled={connecting || (!connected && activeSourceType === "local" && !localConfig.port)}
      >
        {connecting ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            连接中...
          </>
        ) : connected ? (
          "断开连接"
        ) : (
          "连接"
        )}
      </Button>

      {/* Statistics */}
      {connected && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">统计信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">接收:</span>
              <span className="font-mono">{stats.bytesReceivedFormatted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">发送:</span>
              <span className="font-mono">{stats.bytesSentFormatted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">行数:</span>
              <span className="font-mono">{stats.lineCount}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </aside>
  );
}
