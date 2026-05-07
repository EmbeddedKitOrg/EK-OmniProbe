import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebugStore, type PanelId } from "@/stores/debugStore";
import { PANEL_ORDER, PANEL_REGISTRY } from "./panels/panelRegistry";

interface ViewMenuProps {
  onResetLayout: () => void;
}

export function ViewMenu({ onResetLayout }: ViewMenuProps) {
  const visiblePanels = useDebugStore((s) => s.visiblePanels);
  const setPanelVisible = useDebugStore((s) => s.setPanelVisible);

  const handleToggle = (id: PanelId) => {
    setPanelVisible(id, !visiblePanels[id]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 rounded-full px-3">
          <Eye className="h-3.5 w-3.5" />
          <span className="text-xs">视图</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">面板</div>
        <div className="flex flex-col gap-0.5 py-1">
          {PANEL_ORDER.map((id) => {
            const meta = PANEL_REGISTRY[id];
            const checked = visiblePanels[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleToggle(id)}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                    }`}
                  >
                    {checked ? "✓" : ""}
                  </span>
                  <span>{meta.title}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 border-t border-border/60 pt-1">
          <button
            type="button"
            onClick={onResetLayout}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>重置布局</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
