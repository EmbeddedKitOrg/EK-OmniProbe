import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function useSaveTxtContextMenu(onSave: () => void | Promise<void>) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => setPosition(null), []);

  useEffect(() => {
    if (!position) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, position]);

  const onContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const contextMenu = position
    ? createPortal(
        <div
          role="menu"
          className="fixed z-50 min-w-[220px] rounded-md border border-border bg-background py-1 text-sm text-foreground shadow-xl"
          style={{
            left: Math.max(8, Math.min(position.x, window.innerWidth - 236)),
            top: Math.max(8, Math.min(position.y, window.innerHeight - 52)),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              close();
              void onSave();
            }}
          >
            保存当前窗口全部内容为 TXT
          </button>
        </div>,
        document.body
      )
    : null;

  return { onContextMenu, contextMenu };
}
