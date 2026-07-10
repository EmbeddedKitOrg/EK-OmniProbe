/**
 * Flash 模式主组件
 *
 * 职责：
 * - 组合 FlashToolbar 和 FlashContent
 * - 处理固件文件拖放
 */

import { useState, useEffect } from "react";
import { FileCode } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useFlashStore } from "@/stores/flashStore";
import { useLogStore } from "@/stores/logStore";
import { cn } from "@/lib/utils";
import { LogPanel } from "@/components/log/LogPanel";
import { FlashToolbar } from "./FlashToolbar";
import { FlashContent } from "./FlashContent";

// Firmware file extensions
const FIRMWARE_EXTENSIONS = [".hex", ".bin", ".elf", ".axf", ".out", ".ihex"];

// Check if file is a firmware file
function isFirmwareFile(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return FIRMWARE_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
}

export function FlashMode() {
  const [isDragging, setIsDragging] = useState(false);
  const setFirmwarePath = useFlashStore((state) => state.setFirmwarePath);
  const addLog = useLogStore((state) => state.addLog);

  // Listen for file drag-drop events
  useEffect(() => {
    const webview = getCurrentWebviewWindow();

    const unlisten = webview.onDragDropEvent(async (event) => {
      if (event.payload.type === "enter") {
        const paths = event.payload.paths || [];
        const hasFirmwareFile = paths.some(isFirmwareFile);
        if (hasFirmwareFile) {
          setIsDragging(true);
        }
      } else if (event.payload.type === "drop") {
        setIsDragging(false);
        const paths = event.payload.paths || [];
        const firmwareFiles = paths.filter(isFirmwareFile);

        if (firmwareFiles.length > 0) {
          // Use the first firmware file
          const firmwarePath = firmwareFiles[0];
          setFirmwarePath(firmwarePath);
          addLog("info", `已选择固件文件: ${firmwarePath.split(/[\\/]/).pop()}`);

          if (firmwareFiles.length > 1) {
            addLog("warn", `检测到多个固件文件，仅使用第一个`);
          }
        }
      } else if (event.payload.type === "leave") {
        setIsDragging(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setFirmwarePath, addLog]);

  return (
    <div
      className={cn("h-full flex flex-col overflow-hidden relative", isDragging && "ring-2 ring-primary ring-inset")}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed border-primary bg-primary/5">
            <FileCode className="h-12 w-12 text-primary animate-bounce" />
            <p className="text-lg font-medium text-primary">释放以选择固件文件</p>
            <p className="text-xs text-muted-foreground">支持 .hex, .bin, .elf, .axf 格式</p>
          </div>
        </div>
      )}

      {/* Flash Toolbar */}
      <FlashToolbar />

      {/* Flash Content */}
      <div className="flex-1 overflow-hidden">
        <FlashContent />
      </div>

      {/* Log Panel */}
      <LogPanel />
    </div>
  );
}
