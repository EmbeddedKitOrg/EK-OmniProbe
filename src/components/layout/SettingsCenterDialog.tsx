import { useMemo } from "react";
import { Keyboard, Palette, Settings2, SlidersHorizontal, Sparkles } from "lucide-react";
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
import { useAppStore, type AppMode } from "@/stores/appStore";
import { useRttStore } from "@/stores/rttStore";
import { useSerialStore } from "@/stores/serialStore";
import { useUiPreferencesStore } from "@/stores/uiPreferencesStore";
import { UpdateChecker } from "../UpdateChecker";
import type { SignalDomain, ViewMode } from "@/lib/chartTypes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const workspaceOptions: Array<{ value: AppMode; label: string }> = [
  { value: "flash", label: "烧录工作台" },
  { value: "rtt", label: "RTT 工作台" },
  { value: "serial", label: "串口工作台" },
];

const viewModeOptions: Array<{ value: ViewMode; label: string }> = [
  { value: "text", label: "仅文本" },
  { value: "split", label: "分屏" },
  { value: "chart", label: "仅图表" },
];

const signalDomainOptions: Array<{ value: SignalDomain; label: string }> = [
  { value: "time", label: "Time 波形" },
  { value: "fft", label: "FFT 频谱" },
];

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
  const appMode = useAppStore((state) => state.mode);
  const setAppMode = useAppStore((state) => state.setMode);
  const rttViewMode = useRttStore((state) => state.viewMode);
  const setRttViewMode = useRttStore((state) => state.setViewMode);
  const rttChartConfig = useRttStore((state) => state.chartConfig);
  const setRttChartConfig = useRttStore((state) => state.setChartConfig);
  const serialViewMode = useSerialStore((state) => state.viewMode);
  const setSerialViewMode = useSerialStore((state) => state.setViewMode);
  const serialChartConfig = useSerialStore((state) => state.chartConfig);
  const setSerialChartConfig = useSerialStore((state) => state.setChartConfig);
  const logPanelHeight = useUiPreferencesStore((state) => state.logPanelHeight);
  const setLogPanelHeight = useUiPreferencesStore((state) => state.setLogPanelHeight);

  const currentScheme = useMemo(
    () => THEME_SCHEMES.find((scheme) => scheme.id === schemeId) ?? THEME_SCHEMES[0],
    [schemeId]
  );

  const updateSignalPreference = (
    target: "rtt" | "serial",
    domain: SignalDomain
  ) => {
    if (target === "rtt") {
      setRttChartConfig({
        ...rttChartConfig,
        signalDomain: domain,
      });
      return;
    }

    setSerialChartConfig({
      ...serialChartConfig,
      signalDomain: domain,
    });
  };

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
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <div>
                  <h3 className="text-base font-semibold">全局偏好</h3>
                  <p className="text-sm text-muted-foreground">直接控制下次启动和工作区的默认行为。</p>
                </div>
              </div>

              <div className="space-y-4">
                <PreferenceRow
                  label="启动进入"
                  description="应用下次打开时默认进入的工作台。"
                  value={appMode}
                  options={workspaceOptions}
                  onChange={(value) => setAppMode(value as AppMode)}
                />

                <PreferenceRow
                  label="RTT 默认视图"
                  description="决定 RTT 模式默认是文本、图表还是分屏。"
                  value={rttViewMode}
                  options={viewModeOptions}
                  onChange={(value) => setRttViewMode(value as ViewMode)}
                />

                <PreferenceRow
                  label="RTT 波形默认域"
                  description="波形示波器默认优先展示时域还是频域。"
                  value={rttChartConfig.signalDomain}
                  options={signalDomainOptions}
                  onChange={(value) => updateSignalPreference("rtt", value as SignalDomain)}
                />

                <PreferenceRow
                  label="串口默认视图"
                  description="决定串口模式默认是文本、图表还是分屏。"
                  value={serialViewMode}
                  options={viewModeOptions}
                  onChange={(value) => setSerialViewMode(value as ViewMode)}
                />

                <PreferenceRow
                  label="串口波形默认域"
                  description="串口进入波形工作流时默认优先展示的观察域。"
                  value={serialChartConfig.signalDomain}
                  options={signalDomainOptions}
                  onChange={(value) => updateSignalPreference("serial", value as SignalDomain)}
                />

                <div className="rounded-[22px] border border-border/60 bg-white/62 p-4">
                  <div className="mb-1 text-sm font-medium text-foreground">日志面板高度</div>
                  <p className="mb-3 text-sm leading-6 text-muted-foreground">
                    拖动日志面板后会自动记住高度，也可以在这里直接微调。
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={80}
                      max={600}
                      step={8}
                      value={logPanelHeight}
                      onChange={(event) => setLogPanelHeight(parseInt(event.target.value, 10))}
                      className="w-full accent-[hsl(var(--primary))]"
                    />
                    <span className="w-14 text-right text-xs text-muted-foreground">{logPanelHeight}px</span>
                  </div>
                </div>
              </div>
            </section>

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

interface PreferenceOption<T extends string> {
  value: T;
  label: string;
}

interface PreferenceRowProps<T extends string> {
  label: string;
  description: string;
  value: T;
  options: PreferenceOption<T>[];
  onChange: (value: T) => void;
}

function PreferenceRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: PreferenceRowProps<T>) {
  return (
    <div className="rounded-[22px] border border-border/60 bg-white/62 p-4">
      <div className="mb-1 text-sm font-medium text-foreground">{label}</div>
      <p className="mb-3 text-sm leading-6 text-muted-foreground">{description}</p>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as T)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
