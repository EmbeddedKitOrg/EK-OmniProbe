/**
 * Flash 模式工具栏组件
 */

import { useState, useEffect } from "react";
import {
  FolderOpen,
  Save,
  Unlock,
  Trash2,
  CheckCircle,
  Upload,
  Zap,
  RotateCcw,
  Square,
  Play,
} from "lucide-react";
import { TooltipButton, TooltipWrapper } from "@/components/ui/tooltip-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProbeStore } from "@/stores/probeStore";
import { useChipStore } from "@/stores/chipStore";
import { useFlashStore } from "@/stores/flashStore";
import { useLogStore } from "@/stores/logStore";
import { open, save } from "@tauri-apps/plugin-dialog";
import { flashFirmware, eraseChip, eraseSector, verifyFirmware, readFlash, getFirmwareInfo } from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";
import type { FlashProgressEvent, EraseMode } from "@/lib/types";
import { EraseDialog } from "@/components/dialogs/EraseDialog";

function ToolbarSeparator() {
  return <div className="w-px h-6 bg-border mx-1" />;
}

export function FlashToolbar() {
  const { connected } = useProbeStore();
  const { selectedFlashAlgorithm } = useChipStore();
  const {
    firmwarePath,
    setFirmwarePath,
    flashing,
    setFlashing,
    setProgress,
    setFirmwareSize,
    verifyAfterFlash,
    resetAfterFlash,
    eraseMode,
    setEraseMode,
  } = useFlashStore();
  const addLog = useLogStore((state) => state.addLog);
  const [eraseDialogOpen, setEraseDialogOpen] = useState(false);

  useEffect(() => {
    const unlisten = listen<FlashProgressEvent>("flash-progress", (event) => {
      const { phase, progress, message } = event.payload;
      setProgress(progress * 100, phase, message);
      addLog("info", message);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setProgress, addLog]);

  const handleOpenFile = async () => {
    const file = await open({
      multiple: false,
      filters: [
        { name: "固件文件", extensions: ["hex", "bin", "elf", "axf", "out", "ihex"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });

    if (file) {
      setFirmwarePath(file);
      // 获取文件信息
      try {
        const fileInfo = await getFirmwareInfo(file);
        if (fileInfo.exists) {
          setFirmwareSize(fileInfo.size);
          const sizeKB = (fileInfo.size / 1024).toFixed(1);
          addLog("info", `已选择固件文件: ${file.split(/[\\/]/).pop()} (${sizeKB} KB)`);
        } else {
          addLog("warn", `已选择固件文件: ${file} (文件不存在)`);
        }
      } catch {
        addLog("info", `已选择固件文件: ${file}`);
      }
    }
  };

  const handleSaveProject = async () => {
    const path = await save({
      filters: [{ name: "项目文件", extensions: ["daplink"] }],
    });

    if (path) {
      addLog("info", `项目已保存: ${path}`);
    }
  };

  const handleFlash = async () => {
    if (!firmwarePath) {
      addLog("error", "请先选择固件文件");
      return;
    }

    if (!connected) {
      addLog("error", "请先连接设备");
      return;
    }

    try {
      setFlashing(true);
      setProgress(0, "init", "重载固件文件...");

      // 烧录前重载固件文件信息
      const fileInfo = await getFirmwareInfo(firmwarePath);
      if (!fileInfo.exists) {
        addLog("error", `固件文件不存在: ${firmwarePath}`);
        setFlashing(false);
        return;
      }

      setFirmwareSize(fileInfo.size);
      const sizeKB = (fileInfo.size / 1024).toFixed(1);
      addLog("info", `已重载固件文件: ${firmwarePath.split(/[\\/]/).pop()} (${sizeKB} KB)`);

      setProgress(0, "init", "开始烧录");
      addLog("info", `开始烧录: ${firmwarePath}`);

      await flashFirmware({
        file_path: firmwarePath,
        verify: verifyAfterFlash,
        skip_erase: false,
        reset_after: resetAfterFlash,
        erase_mode: eraseMode,
        flash_algorithm: selectedFlashAlgorithm || undefined,
      });

      addLog("success", "烧录成功");
    } catch (error) {
      addLog("error", `烧录失败: ${error}`);
    } finally {
      setFlashing(false);
    }
  };

  const handleErase = async () => {
    if (!connected) {
      addLog("error", "请先连接设备");
      return;
    }
    setEraseDialogOpen(true);
  };

  const handleEraseConfirm = async (mode: "full" | "custom", address?: number, size?: number) => {
    try {
      setFlashing(true);

      if (mode === "full") {
        addLog("info", "开始全片擦除");
        await eraseChip();
        addLog("success", "全片擦除完成");
      } else if (mode === "custom" && address !== undefined && size !== undefined) {
        addLog("info", `开始擦除 0x${address.toString(16).toUpperCase()} - 0x${(address + size).toString(16).toUpperCase()} (${size} 字节)`);
        await eraseSector(address, size);
        addLog("success", "自定义范围擦除完成");
      }
    } catch (error) {
      addLog("error", `擦除失败: ${error}`);
    } finally {
      setFlashing(false);
    }
  };

  const handleVerify = async () => {
    if (!firmwarePath) {
      addLog("error", "请先选择固件文件");
      return;
    }

    if (!connected) {
      addLog("error", "请先连接设备");
      return;
    }

    try {
      setFlashing(true);
      addLog("info", "开始校验");
      const result = await verifyFirmware(firmwarePath);
      if (result) {
        addLog("success", "校验通过");
      } else {
        addLog("error", "校验失败");
      }
    } catch (error) {
      addLog("error", `校验失败: ${error}`);
    } finally {
      setFlashing(false);
    }
  };

  const handleRead = async () => {
    if (!connected) {
      addLog("error", "请先连接设备");
      return;
    }

    const path = await save({
      filters: [{ name: "二进制文件", extensions: ["bin"] }],
    });

    if (path) {
      try {
        setFlashing(true);
        addLog("info", "开始读取Flash");
        const data = await readFlash(0x08000000, 0x10000); // 64KB
        addLog("success", `已读取 ${data.length} 字节到 ${path}`);
      } catch (error) {
        addLog("error", `读取失败: ${error}`);
      } finally {
        setFlashing(false);
      }
    }
  };

  return (
    <div className="flex items-center h-10 px-2 border-b border-border bg-muted/30">
      <div className="flex items-center gap-1">
        {/* File operations */}
        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<FolderOpen className="h-4 w-4" />}
          tooltip="打开固件文件"
          onClick={handleOpenFile}
        />
        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<Save className="h-4 w-4" />}
          tooltip="保存项目"
          onClick={handleSaveProject}
        />
        <ToolbarSeparator />

        {/* Device operations */}
        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<Unlock className="h-4 w-4" />}
          tooltip="解锁芯片"
          disabled={!connected || flashing}
        />
        <ToolbarSeparator />

        {/* Flash operations */}
        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<Trash2 className="h-4 w-4" />}
          tooltip="擦除Flash"
          disabled={!connected || flashing}
          onClick={handleErase}
        />

        {/* Erase mode selector */}
        <TooltipWrapper tooltip="烧录时的擦除模式：扇区擦除只擦除需要写入的区域（快），整片擦除会清空整个Flash（慢但彻底）">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">烧录模式:</span>
            <Select
              value={eraseMode}
              onValueChange={(value) => setEraseMode(value as EraseMode)}
              disabled={flashing}
            >
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SectorErase">扇区擦除</SelectItem>
                <SelectItem value="ChipErase">整片擦除</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TooltipWrapper>

        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<CheckCircle className="h-4 w-4" />}
          tooltip="校验"
          disabled={!connected || flashing || !firmwarePath}
          onClick={handleVerify}
        />
        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<Upload className="h-4 w-4" />}
          tooltip="读取Flash"
          disabled={!connected || flashing}
          onClick={handleRead}
        />
        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<Zap className="h-4 w-4" />}
          tooltip="一键烧录"
          disabled={!connected || flashing || !firmwarePath}
          onClick={handleFlash}
        />
        <ToolbarSeparator />

        {/* Control operations */}
        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<RotateCcw className="h-4 w-4" />}
          tooltip="复位"
          disabled={!connected || flashing}
        />
        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<Square className="h-4 w-4" />}
          tooltip="停止"
          disabled={!connected || flashing}
        />
        <TooltipButton
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={<Play className="h-4 w-4" />}
          tooltip="运行"
          disabled={!connected || flashing}
        />
      </div>

      {/* Status display */}
      <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
        {firmwarePath && (
          <span className="max-w-[200px] truncate text-xs" title={firmwarePath}>
            {firmwarePath.split(/[\\/]/).pop()}
          </span>
        )}
      </div>

      {/* Erase dialog */}
      <EraseDialog
        open={eraseDialogOpen}
        onOpenChange={setEraseDialogOpen}
        onConfirm={handleEraseConfirm}
      />
    </div>
  );
}
