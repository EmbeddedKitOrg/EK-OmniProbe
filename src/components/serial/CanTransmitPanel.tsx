import { useMemo, useState } from "react";
import { Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildSlcanFrameCommand } from "@/lib/parseCan";
import { parseHexBytes, sendSerialPayload } from "@/lib/serialSend";

type FrameMode = "classic" | "rtr" | "fd" | "fd-brs";

interface CanTransmitPanelProps {
  connected: boolean;
  onInitialize: () => Promise<void>;
}

export function CanTransmitPanel({ connected, onInitialize }: CanTransmitPanelProps) {
  const [idText, setIdText] = useState("123");
  const [extended, setExtended] = useState(false);
  const [mode, setMode] = useState<FrameMode>("classic");
  const [dataText, setDataText] = useState("");
  const [rtrDlc, setRtrDlc] = useState(0);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const command = useMemo(() => {
    try {
      const data = mode === "rtr" ? [] : parseHexBytes(dataText);
      return buildSlcanFrameCommand({
        id: Number.parseInt(idText.replace(/^0x/i, "") || "0", 16),
        extended,
        rtr: mode === "rtr",
        dlc: mode === "rtr" ? rtrDlc : undefined,
        fd: mode === "fd" || mode === "fd-brs",
        brs: mode === "fd-brs",
        data,
      });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [dataText, extended, idText, mode, rtrDlc]);
  const valid = /^[tTrRdDbB][0-9A-F]+$/.test(command);

  const send = async () => {
    if (!valid) return;
    setSending(true);
    try {
      await sendSerialPayload(command, { encoding: "utf-8", lineEnding: "cr" });
      setStatus(`已发送 ${command}`);
    } catch (error) {
      setStatus(`发送失败：${error}`);
    } finally {
      setSending(false);
    }
  };

  const initialize = async () => {
    setSending(true);
    try {
      await onInitialize();
      setStatus("适配器初始化命令已发送");
    } catch (error) {
      setStatus(`初始化失败：${error}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="can-tx-id">CAN ID (HEX)</Label>
          <Input
            id="can-tx-id"
            value={idText}
            onChange={(event) => /^[0-9a-fx]*$/i.test(event.target.value) && setIdText(event.target.value)}
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label>帧格式</Label>
          <Select
            value={extended ? "extended" : "standard"}
            onValueChange={(value) => setExtended(value === "extended")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">标准帧 11-bit</SelectItem>
              <SelectItem value="extended">扩展帧 29-bit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>帧类型</Label>
          <Select value={mode} onValueChange={(value) => setMode(value as FrameMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="classic">经典 CAN</SelectItem>
              <SelectItem value="rtr">远程帧 RTR</SelectItem>
              <SelectItem value="fd">CAN FD</SelectItem>
              <SelectItem value="fd-brs">CAN FD + BRS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === "rtr" ? (
        <div className="space-y-1">
          <Label htmlFor="can-tx-rtr-dlc">RTR DLC</Label>
          <Input
            id="can-tx-rtr-dlc"
            type="number"
            min={0}
            max={8}
            value={rtrDlc}
            onChange={(event) => setRtrDlc(Number(event.target.value))}
          />
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="can-tx-data">DATA (HEX)</Label>
          <Input
            id="can-tx-data"
            value={dataText}
            onChange={(event) => setDataText(event.target.value)}
            placeholder="AA BB CC DD"
            className="font-mono"
          />
        </div>
      )}

      <div className="rounded-[8px] border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs">
        {valid ? command : <span className="text-destructive">{command}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="gap-2" disabled={!connected || sending} onClick={initialize}>
          <Settings2 className="h-4 w-4" />
          初始化适配器
        </Button>
        <Button type="button" className="gap-2" disabled={!connected || sending || !valid} onClick={send}>
          <Send className="h-4 w-4" />
          发送 CAN 帧
        </Button>
        <span className="text-xs text-muted-foreground">{connected ? status : "串口未连接"}</span>
      </div>
    </div>
  );
}
