/**
 * Flash 模式内容区域组件
 */

import { Cpu, HardDrive, Layers, Settings } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useProbeStore } from "@/stores/probeStore";
import { useChipStore } from "@/stores/chipStore";
import { useFlashStore } from "@/stores/flashStore";
import { formatBytes, formatHex } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";

export function FlashContent() {
  const { connected, targetInfo } = useProbeStore(
    useShallow((state) => ({ connected: state.connected, targetInfo: state.targetInfo }))
  );
  const { chipInfo, selectedFlashAlgorithm, selectFlashAlgorithm } = useChipStore(
    useShallow((state) => ({
      chipInfo: state.chipInfo,
      selectedFlashAlgorithm: state.selectedFlashAlgorithm,
      selectFlashAlgorithm: state.selectFlashAlgorithm,
    }))
  );
  const {
    flashing,
    progress,
    message,
    firmwarePath,
    firmwareSize,
    verifyAfterFlash,
    resetAfterFlash,
    useCustomAddress,
    customFlashAddress,
    customFlashSize,
    setVerifyAfterFlash,
    setResetAfterFlash,
    setUseCustomAddress,
    setCustomFlashAddress,
    setCustomFlashSize,
  } = useFlashStore(
    useShallow((state) => ({
      flashing: state.flashing,
      progress: state.progress,
      message: state.message,
      firmwarePath: state.firmwarePath,
      firmwareSize: state.firmwareSize,
      verifyAfterFlash: state.verifyAfterFlash,
      resetAfterFlash: state.resetAfterFlash,
      useCustomAddress: state.useCustomAddress,
      customFlashAddress: state.customFlashAddress,
      customFlashSize: state.customFlashSize,
      setVerifyAfterFlash: state.setVerifyAfterFlash,
      setResetAfterFlash: state.setResetAfterFlash,
      setUseCustomAddress: state.setUseCustomAddress,
      setCustomFlashAddress: state.setCustomFlashAddress,
      setCustomFlashSize: state.setCustomFlashSize,
    }))
  );

  return (
    <div className="flash-content h-full overflow-y-auto p-4">
      <div className="flash-content-grid grid grid-cols-2 gap-4">
        {/* Chip info */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              芯片信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chipInfo ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">型号</span>
                  <span className="font-mono">{chipInfo.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">厂商</span>
                  <span>{chipInfo.vendor || "未知"}</span>
                </div>
                {chipInfo.cores.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">内核</span>
                    <span>{chipInfo.cores[0].core_type}</span>
                  </div>
                )}
                {connected && targetInfo && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">状态</span>
                    <span className="text-green-500">已连接</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">请选择目标芯片</div>
            )}
          </CardContent>
        </Card>

        {/* Flash mapping */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Flash 映射
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chipInfo && chipInfo.memory_regions.length > 0 ? (
              <div className="space-y-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left py-1">名称</th>
                      <th className="text-left py-1">类型</th>
                      <th className="text-right py-1">起始地址</th>
                      <th className="text-right py-1">大小</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chipInfo.memory_regions.map((region, index) => (
                      <tr key={index} className="border-t border-border">
                        <td className="py-1">{region.name || `区域${index + 1}`}</td>
                        <td className="py-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs ${
                              region.kind === "Flash"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-green-500/20 text-green-400"
                            }`}
                          >
                            {region.kind}
                          </span>
                        </td>
                        <td className="text-right font-mono py-1">{formatHex(region.address)}</td>
                        <td className="text-right font-mono py-1">{formatBytes(region.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">无Flash映射信息</div>
            )}
          </CardContent>
        </Card>

        {/* Flash algorithm */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" />
              烧录算法
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chipInfo && chipInfo.flash_algorithms.length > 0 ? (
              <div className="space-y-1">
                {chipInfo.flash_algorithms.map((algo, index) => (
                  <div
                    key={index}
                    onClick={() => selectFlashAlgorithm(algo.name)}
                    className={`flex items-center justify-between text-sm py-2 px-2 rounded cursor-pointer transition-colors ${
                      selectedFlashAlgorithm === algo.name
                        ? "bg-primary/10 border border-primary"
                        : "hover:bg-accent border border-transparent"
                    }`}
                  >
                    <span className="font-mono text-xs">{algo.name}</span>
                    <div className="flex items-center gap-2">
                      {algo.default && <span className="text-xs text-green-500">默认</span>}
                      {selectedFlashAlgorithm === algo.name && (
                        <span className="text-xs text-primary font-medium">✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">无烧录算法</div>
            )}
          </CardContent>
        </Card>

        {/* Flash settings */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              烧录设置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">固件文件</span>
                <span className="font-mono text-xs max-w-[150px] truncate">
                  {firmwarePath ? firmwarePath.split(/[\\/]/).pop() : "未选择"}
                </span>
              </div>
              {firmwarePath && firmwareSize > 0 && (
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">文件大小</span>
                  <span className="font-mono text-xs">{formatBytes(firmwareSize)}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">烧录后校验</span>
                <input
                  type="checkbox"
                  checked={verifyAfterFlash}
                  onChange={(e) => setVerifyAfterFlash(e.target.checked)}
                  className="h-4 w-4"
                />
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-muted-foreground">烧录后复位</span>
                <input
                  type="checkbox"
                  checked={resetAfterFlash}
                  onChange={(e) => setResetAfterFlash(e.target.checked)}
                  className="h-4 w-4"
                />
              </div>

              <div className="border-t border-border mt-3 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground">自定义ROM地址</span>
                  <input
                    type="checkbox"
                    checked={useCustomAddress}
                    onChange={(e) => setUseCustomAddress(e.target.checked)}
                    className="h-4 w-4"
                  />
                </div>

                {useCustomAddress && (
                  <div className="space-y-2 mt-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-muted-foreground">IROM1 起始地址</label>
                        {chipInfo && chipInfo.memory_regions.length > 0 && (
                          <button
                            onClick={() => {
                              const flashRegion = chipInfo.memory_regions.find((r) => r.kind === "Flash");
                              if (flashRegion) {
                                setCustomFlashAddress(flashRegion.address);
                                setCustomFlashSize(flashRegion.size);
                              }
                            }}
                            className="text-xs text-blue-500 hover:text-blue-400"
                          >
                            使用芯片默认值
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={`0x${customFlashAddress.toString(16).toUpperCase().padStart(8, "0")}`}
                        onChange={(e) => {
                          const value = e.target.value.replace(/^0x/i, "");
                          const parsed = parseInt(value, 16);
                          if (!isNaN(parsed)) {
                            setCustomFlashAddress(parsed);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs font-mono bg-background border border-border rounded"
                        placeholder="0x08000000"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">IROM1 大小</label>
                      <input
                        type="text"
                        value={`0x${customFlashSize.toString(16).toUpperCase()}`}
                        onChange={(e) => {
                          const value = e.target.value.replace(/^0x/i, "");
                          const parsed = parseInt(value, 16);
                          if (!isNaN(parsed)) {
                            setCustomFlashSize(parsed);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs font-mono bg-background border border-border rounded"
                        placeholder="0x100000"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {customFlashSize > 0 ? `${formatBytes(customFlashSize)} (${customFlashSize} 字节)` : "未设置"}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                      <div className="font-medium mb-1">参考 (Keil风格):</div>
                      <div>• IROM1: 0x08000000, 0x100000 (1MB)</div>
                      <div>• IRAM1: 0x20000000, 0x1C000 (112KB)</div>
                      <div className="mt-1 text-[10px]">注：烧录时仅需配置ROM区域</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress display */}
      {flashing && (
        <Card className="mt-4">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">烧录进度</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={progress} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{message}</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
