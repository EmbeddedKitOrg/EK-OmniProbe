import { useMemo } from "react";
import { Keyboard, Palette, Settings2, Sparkles } from "lucide-react";
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
import { UpdateChecker } from "../UpdateChecker";

const quickActions = [
  {
    title: "波形 / FFT",
    description: "在 RTT 或串口中切到图表视图，再用工具栏的“波形 / FFT”快捷入口查看时域或频域。",
  },
  {
    title: "智能启用",
    description: "收到数值流后点“智能启用”，程序会自动识别单值、CSV、XY 或 JSON 并生成图表配置。",
  },
  {
    title: "快捷键",
    description: "Ctrl+1 烧录，Ctrl+2 RTT，Ctrl+3 串口。",
  },
];

export function SettingsCenterDialog() {
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
          title="打开设置中心"
        >
          <Settings2 className="h-4 w-4" />
          <span>设置</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl rounded-[34px] p-7">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            设置中心
          </DialogTitle>
          <DialogDescription className="text-[15px] text-[hsl(var(--secondary-foreground))]/88">
            把界面风格、更新入口和常用工作流收口到一个地方。当前配色：{currentScheme.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
          <section className="glass-section rounded-[28px] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <div>
                <h3 className="text-base font-semibold">外观与主题</h3>
                <p className="text-sm text-muted-foreground">延续 Entrance 风格，但保持更适合桌面调试工具的厚实玻璃感。</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {THEME_SCHEMES.map((scheme) => {
                const active = scheme.id === schemeId;
                return (
                  <button
                    key={scheme.id}
                    type="button"
                    onClick={() => setSchemeId(scheme.id)}
                    className={cn(
                      "glass-card group rounded-[24px] p-4 text-left transition-all duration-200",
                      "hover:-translate-y-0.5 hover:border-primary/28 hover:shadow-[0_18px_38px_rgba(72,92,140,0.14)]",
                      active && "glass-card-active"
                    )}
                  >
                    <div className="relative z-[1] mb-4 flex items-start justify-between gap-3">
                      <div className="flex gap-2">
                        {scheme.swatches.map((swatch) => (
                          <span
                            key={swatch}
                            className="h-5 w-5 rounded-full border border-black/5 shadow-sm"
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
                      <div className="text-lg font-semibold tracking-tight text-foreground">
                        {scheme.name}
                      </div>
                      <div className="text-sm text-muted-foreground">{scheme.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="space-y-4">
            <section className="glass-section rounded-[28px] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <div>
                  <h3 className="text-base font-semibold">应用工具</h3>
                  <p className="text-sm text-muted-foreground">把常用的全局操作集中到工作台级入口。</p>
                </div>
              </div>

              <div className="space-y-3">
                <UpdateChecker
                  autoCheck={false}
                  trigger={(
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <Sparkles className="h-4 w-4" />
                      检查更新
                    </Button>
                  )}
                />
                <div className="rounded-[22px] border border-border/60 bg-white/60 p-4 text-sm text-muted-foreground">
                  当前设置中心先收口主题与更新，后续会继续并入通用偏好、RTT/串口图表偏好和实验功能开关。
                </div>
              </div>
            </section>

            <section className="glass-section rounded-[28px] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-primary" />
                <div>
                  <h3 className="text-base font-semibold">工作流提示</h3>
                  <p className="text-sm text-muted-foreground">减少“入口藏太深”的情况，让第一次使用也更顺手。</p>
                </div>
              </div>

              <div className="space-y-3">
                {quickActions.map((item) => (
                  <div key={item.title} className="rounded-[22px] border border-border/60 bg-white/62 p-4">
                    <div className="mb-1 text-sm font-medium text-foreground">{item.title}</div>
                    <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
