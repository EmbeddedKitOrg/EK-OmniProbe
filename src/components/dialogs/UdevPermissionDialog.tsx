import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, Terminal } from "lucide-react";
import {
  checkUsbPermissions,
  installUdevRules,
  getUdevInstallInstructions,
} from "@/lib/tauri";
import type { UsbPermissionStatus } from "@/lib/types";

export function UdevPermissionDialog() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<UsbPermissionStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string>("");

  useEffect(() => {
    // 监听后端发送的 udev 规则缺失事件
    const unlisten = listen("udev-rules-missing", async () => {
      console.log("收到 udev 规则缺失通知");
      await checkPermissions();
      setOpen(true);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const checkPermissions = async () => {
    try {
      const result = await checkUsbPermissions();
      setStatus(result);

      // 获取手动安装说明
      const inst = await getUdevInstallInstructions();
      setInstructions(inst);
    } catch (error) {
      console.error("检查权限失败:", error);
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    setInstallResult(null);

    try {
      const result = await installUdevRules();
      setInstallResult(result);

      // 重新检查权限
      await checkPermissions();
    } catch (error) {
      setInstallResult(`安装失败: ${error}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setInstallResult(null);
  };

  if (!status) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            USB 调试器权限配置
          </DialogTitle>
          <DialogDescription>
            检测到您的系统需要配置 udev 规则才能访问 USB 调试器
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 权限状态 */}
          <Alert variant={status.has_permission ? "default" : "destructive"}>
            <AlertDescription>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {status.has_permission ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="font-medium">
                    USB 权限: {status.has_permission ? "正常" : "需要配置"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {status.udev_rules_installed ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="font-medium">
                    udev 规则: {status.udev_rules_installed ? "已安装" : "未安装"}
                  </span>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* 检测到的设备 */}
          {status.detected_dap_devices.length > 0 && (
            <div className="text-sm">
              <p className="font-medium mb-2">检测到的调试器:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                {status.detected_dap_devices.map((device, index) => (
                  <li key={index}>
                    {device.product || "未知设备"} (VID: 0x
                    {device.vendor_id.toString(16).padStart(4, "0")}, PID: 0x
                    {device.product_id.toString(16).padStart(4, "0")})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 建议 */}
          {status.suggestions.length > 0 && (
            <div className="text-sm">
              <p className="font-medium mb-2">解决方案:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                {status.suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 安装结果 */}
          {installResult && (
            <Alert
              variant={
                installResult.includes("成功") ? "default" : "destructive"
              }
            >
              <AlertDescription>{installResult}</AlertDescription>
            </Alert>
          )}

          {/* 手动安装说明 */}
          {!status.udev_rules_installed && instructions && (
            <div className="bg-muted p-4 rounded-md">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-4 h-4" />
                <span className="font-medium text-sm">手动安装方法:</span>
              </div>
              <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
                {instructions}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            稍后配置
          </Button>
          {!status.udev_rules_installed && (
            <Button onClick={handleInstall} disabled={installing}>
              {installing ? "安装中..." : "自动安装 udev 规则"}
            </Button>
          )}
          {status.udev_rules_installed && status.has_permission && (
            <Button onClick={handleClose}>完成</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
