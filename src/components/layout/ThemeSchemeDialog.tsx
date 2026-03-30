import { useMemo } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { THEME_SCHEMES } from "@/lib/themeSchemes";
import { useThemeStore } from "@/stores/themeStore";

export function ThemeSchemeDialog() {
  const schemeId = useThemeStore((state) => state.schemeId);
  const setSchemeId = useThemeStore((state) => state.setSchemeId);

  const currentScheme = useMemo(
    () => THEME_SCHEMES.find((scheme) => scheme.id === schemeId) ?? THEME_SCHEMES[0],
    [schemeId]
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 rounded-full px-4"
          title="选择界面配色方案"
        >
          <Palette className="h-4 w-4" />
          <span>配色</span>
          <span className="hidden text-muted-foreground md:inline">· {currentScheme.name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl rounded-[34px] p-7">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            配色方案
          </DialogTitle>
          <DialogDescription className="text-[15px] text-[hsl(var(--secondary-foreground))]/88">
            参考 Entrance 风格整理了一组柔和的 Material 风格主题。当前方案：{currentScheme.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {THEME_SCHEMES.map((scheme) => {
            const active = scheme.id === schemeId;
            return (
              <button
                key={scheme.id}
                type="button"
                onClick={() => setSchemeId(scheme.id)}
                className={cn(
                  "glass-card group rounded-[28px] p-5 text-left transition-all duration-200",
                  "hover:-translate-y-0.5 hover:border-primary/28 hover:shadow-[0_18px_38px_rgba(72,92,140,0.14)]",
                  active
                    ? "glass-card-active"
                    : ""
                )}
              >
                <div className="relative z-[1] mb-5 flex items-start justify-between gap-3">
                  <div className="flex gap-2">
                    {scheme.swatches.map((swatch) => (
                      <span
                        key={swatch}
                        className="h-6 w-6 rounded-full border border-black/5 shadow-sm"
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </div>
                  {active && (
                    <span className="glass-badge rounded-full px-3 py-1 text-[11px] font-medium text-secondary-foreground">
                      当前
                    </span>
                  )}
                </div>

                <div className="relative z-[1] space-y-1">
                  <div className="text-[1.9rem] font-semibold tracking-tight text-foreground">
                    {scheme.name}
                  </div>
                  <div className="text-[15px] text-muted-foreground">{scheme.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
