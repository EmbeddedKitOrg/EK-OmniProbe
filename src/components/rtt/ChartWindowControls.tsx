import { ArrowLeftRight, MonitorUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChartWindowControlsProps {
  detached: boolean;
  onDetach: () => void | Promise<void>;
  onFocus: () => void | Promise<void>;
  onRestore: () => void | Promise<void>;
}

export function ChartWindowActions({ detached, onDetach, onFocus, onRestore }: ChartWindowControlsProps) {
  return detached ? (
    <>
      <Button size="sm" variant="outline" className="gap-1" onClick={() => void onFocus()}>
        <MonitorUp className="h-3.5 w-3.5" />
        定位窗口
      </Button>
      <Button size="sm" variant="outline" className="gap-1" onClick={() => void onRestore()}>
        <ArrowLeftRight className="h-3.5 w-3.5" />
        收回
      </Button>
    </>
  ) : (
    <Button size="sm" variant="outline" className="gap-1" onClick={() => void onDetach()}>
      <MonitorUp className="h-3.5 w-3.5" />
      独立窗口
    </Button>
  );
}

export function ChartDetachedPlaceholder({
  onFocus,
  onRestore,
}: Pick<ChartWindowControlsProps, "onFocus" | "onRestore">) {
  return (
    <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-white/55">
      <div className="space-y-3 text-center">
        <div className="text-base font-medium text-foreground">图表工作台已在独立窗口打开</div>
        <div className="text-xs text-muted-foreground">
          主窗口继续负责接收数据；你可以定位独立窗口，也可以随时收回到这里。
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void onFocus()}>
            <MonitorUp className="h-3.5 w-3.5" />
            定位窗口
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void onRestore()}>
            <ArrowLeftRight className="h-3.5 w-3.5" />
            收回主界面
          </Button>
        </div>
      </div>
    </div>
  );
}
