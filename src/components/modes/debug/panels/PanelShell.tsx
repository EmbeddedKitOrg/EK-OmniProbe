import type { ReactNode } from "react";

interface PanelShellProps {
  title: string;
  hint?: string;
  children?: ReactNode;
}

export function PanelShell({ title, hint, children }: PanelShellProps) {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</span>
      </div>
      {children ?? (
        <div className="flex flex-1 items-center justify-center text-center">
          <div className="text-xs text-muted-foreground">{hint ?? "占位面板，等待后续阶段接入。"}</div>
        </div>
      )}
    </div>
  );
}
