import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle } from "lucide-react";

interface EraseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mode: "full" | "custom", address?: number, size?: number) => void;
}

export function EraseDialog({ open, onOpenChange, onConfirm }: EraseDialogProps) {
  const [eraseMode, setEraseMode] = useState<"full" | "custom">("full");
  const [address, setAddress] = useState("0x08000000");
  const [size, setSize] = useState("0x10000");

  const handleConfirm = () => {
    if (eraseMode === "full") {
      onConfirm("full");
    } else {
      try {
        const addr = parseInt(address, 16);
        const sz = parseInt(size, 16);
        if (isNaN(addr) || isNaN(sz) || sz <= 0) {
          alert("请输入有效的地址和大小（十六进制格式）");
          return;
        }
        onConfirm("custom", addr, sz);
      } catch (error) {
        alert("地址或大小格式错误");
        return;
      }
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            擦除 Flash
          </DialogTitle>
          <DialogDescription>
            选择擦除模式。此操作不可恢复，请谨慎操作。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={eraseMode} onValueChange={(v) => setEraseMode(v as "full" | "custom")}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="full" id="full" />
              <Label htmlFor="full" className="font-normal cursor-pointer">
                全片擦除（推荐）
              </Label>
            </div>
            <div className="text-xs text-muted-foreground ml-6">
              擦除整个 Flash 存储器，速度快且彻底
            </div>

            <div className="flex items-center space-x-2 mt-3">
              <RadioGroupItem value="custom" id="custom" />
              <Label htmlFor="custom" className="font-normal cursor-pointer">
                自定义范围擦除
              </Label>
            </div>
            <div className="text-xs text-muted-foreground ml-6">
              擦除指定地址范围的扇区（高级选项）
            </div>
          </RadioGroup>

          {eraseMode === "custom" && (
            <div className="glass-section ml-6 mt-3 space-y-3 rounded-2xl p-3">
              <div className="space-y-1">
                <Label htmlFor="address" className="text-xs">
                  起始地址（十六进制）
                </Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x08000000"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="size" className="text-xs">
                  擦除大小（十六进制）
                </Label>
                <Input
                  id="size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="0x10000"
                  className="font-mono text-xs"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                示例：0x08000000 起始，0x10000 大小（64KB）
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            确认擦除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
