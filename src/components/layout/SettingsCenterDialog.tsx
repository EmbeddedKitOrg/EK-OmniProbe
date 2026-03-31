import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ImagePlus,
  Keyboard,
  Palette,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
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
import {
  useUiPreferencesStore,
  type BackgroundMode,
} from "@/stores/uiPreferencesStore";
import { UpdateChecker } from "../UpdateChecker";
import type { SignalDomain, ViewMode } from "@/lib/chartTypes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
  const [themeSectionOpen, setThemeSectionOpen] = useState(false);
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
  const backgroundMode = useUiPreferencesStore((state) => state.backgroundMode);
  const setBackgroundMode = useUiPreferencesStore((state) => state.setBackgroundMode);
  const backgroundImagePath = useUiPreferencesStore((state) => state.backgroundImagePath);
  const setBackgroundImagePath = useUiPreferencesStore((state) => state.setBackgroundImagePath);
  const backgroundImageOpacity = useUiPreferencesStore((state) => state.backgroundImageOpacity);
  const setBackgroundImageOpacity = useUiPreferencesStore((state) => state.setBackgroundImageOpacity);
  const clearBackgroundImage = useUiPreferencesStore((state) => state.clearBackgroundImage);

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

  const backgroundImageName = useMemo(() => {
    if (!backgroundImagePath) {
      return "未选择图片";
    }

    return backgroundImagePath.split(/[\\/]/).pop() ?? backgroundImagePath;
  }, [backgroundImagePath]);

  const handleSelectBackgroundImage = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "图片文件", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });

    if (typeof selected === "string" && selected) {
      setBackgroundImagePath(selected);
    }
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
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] max-w-4xl max-h-[min(88vh,760px)] rounded-[28px] overflow-hidden p-4 sm:p-5">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            设置中心
          </DialogTitle>
          <DialogDescription className="text-xs text-[hsl(var(--secondary-foreground))]/82">
            当前配色：{currentScheme.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="flex min-h-0 flex-col gap-3">
          <TabsList className="surface-control h-auto w-full justify-start gap-1 rounded-[18px] border border-border/60 p-1">
            <TabsTrigger value="appearance" className="rounded-[12px] px-2.5 py-1 text-xs">
              外观
            </TabsTrigger>
            <TabsTrigger value="preferences" className="rounded-[12px] px-2.5 py-1 text-xs">
              偏好
            </TabsTrigger>
            <TabsTrigger value="tools" className="rounded-[12px] px-2.5 py-1 text-xs">
              工具
            </TabsTrigger>
          </TabsList>

          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          <TabsContent value="appearance" className="mt-0 space-y-3">
            <section className="glass-section rounded-[22px] p-3">
              <div className="mb-2 flex items-center gap-2">
                <ImagePlus className="h-3.5 w-3.5 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">背景显示</h3>
                  <p className="text-xs text-muted-foreground">首屏直接设置背景。</p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <BackgroundModeCard
                  mode="default"
                  title="保留当前背景"
                  description="继续使用主题渐变。"
                  active={backgroundMode === "default"}
                  onClick={() => setBackgroundMode("default")}
                />
                <BackgroundModeCard
                  mode="custom"
                  title="自定义图片"
                  description="叠加本地图片。"
                  active={backgroundMode === "custom"}
                  onClick={() => setBackgroundMode("custom")}
                />
              </div>

              <div className="mt-2.5 rounded-[16px] border border-border/60 bg-white/72 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
                  <FolderOpen className="h-3.5 w-3.5 text-primary" />
                  图片资源
                </div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">当前图片</div>
                    <div className="truncate text-xs text-foreground">{backgroundImageName}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleSelectBackgroundImage}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      选择
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={clearBackgroundImage}
                      disabled={!backgroundImagePath}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      默认
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-foreground">图片透明度</div>
                      <div className="text-xs text-muted-foreground">只影响背景图片。</div>
                    </div>
                    <span className="w-12 text-right text-xs text-muted-foreground">
                      {Math.round(backgroundImageOpacity * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(backgroundImageOpacity * 100)}
                      onChange={(event) =>
                        setBackgroundImageOpacity(parseInt(event.target.value, 10) / 100)
                      }
                      className="w-full accent-[hsl(var(--primary))]"
                    />
                  </div>
                </div>
              </div>
            </section>

            <Collapsible open={themeSectionOpen} onOpenChange={setThemeSectionOpen}>
              <section className="glass-section rounded-[22px] p-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-[16px] text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Palette className="h-3.5 w-3.5 text-primary" />
                      <div>
                        <h3 className="text-sm font-semibold">主题方案</h3>
                        <p className="text-xs text-muted-foreground">按需展开。</p>
                      </div>
                    </div>
                    {themeSectionOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent className="pt-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {THEME_SCHEMES.map((scheme) => {
                      const active = scheme.id === schemeId;
                      return (
                        <button
                          key={scheme.id}
                          type="button"
                          onClick={() => setSchemeId(scheme.id)}
                          className={cn(
                            "rounded-[16px] border border-border/60 bg-white/72 p-2.5 text-left transition-all duration-200",
                            "hover:-translate-y-0.5 hover:border-primary/28",
                            active && "border-primary/40 bg-primary/8 shadow-[0_12px_28px_rgba(72,92,140,0.12)]"
                          )}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <div className="flex gap-1.5">
                              {scheme.swatches.map((swatch) => (
                                <span
                                  key={swatch}
                                  className="h-3.5 w-3.5 rounded-full border border-black/5 shadow-sm"
                                  style={{ backgroundColor: swatch }}
                                />
                              ))}
                            </div>
                            {active && (
                              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-secondary-foreground shadow-sm">
                                当前
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-foreground">{scheme.name}</div>
                          <div className="text-xs text-muted-foreground">{scheme.subtitle}</div>
                        </button>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </section>
            </Collapsible>
          </TabsContent>

          <TabsContent value="preferences" className="mt-0">
            <section className="glass-section rounded-[22px] p-3">
              <div className="mb-2 flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">全局偏好</h3>
                  <p className="text-xs text-muted-foreground">启动与默认行为设置。</p>
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

                <div className="rounded-[18px] border border-border/60 bg-white/62 p-3">
                  <div className="mb-1 text-xs font-medium text-foreground">日志面板高度</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    支持拖动后自动记忆，也可在这里微调。
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
          </TabsContent>

          <TabsContent value="tools" className="mt-0 space-y-4">
            <section className="glass-section rounded-[22px] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">应用工具</h3>
                  <p className="text-xs text-muted-foreground">常用全局操作。</p>
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
                <div className="rounded-[18px] border border-border/60 bg-white/60 p-3 text-xs text-muted-foreground">
                  当前设置中心先收口主题、背景与更新，后续会继续并入通用偏好、RTT/串口图表偏好和实验功能开关。
                </div>
              </div>
            </section>

            <section className="glass-section rounded-[22px] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Keyboard className="h-3.5 w-3.5 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">工作流提示</h3>
                  <p className="text-xs text-muted-foreground">保留几个高频提示。</p>
                </div>
              </div>

              <div className="space-y-2">
                {quickActions.map((item) => (
                  <div key={item.title} className="rounded-[18px] border border-border/60 bg-white/62 p-3">
                    <div className="mb-1 text-xs font-medium text-foreground">{item.title}</div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>
          </div>
        </Tabs>
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
    <div className="rounded-[18px] border border-border/60 bg-white/62 p-3">
      <div className="mb-1 text-xs font-medium text-foreground">{label}</div>
      <p className="mb-2 text-xs text-muted-foreground">{description}</p>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as T)}>
        <SelectTrigger className="h-8 text-xs">
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

interface BackgroundModeCardProps {
  mode: BackgroundMode;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}

function BackgroundModeCard({
  mode,
  title,
  description,
  active,
  onClick,
}: BackgroundModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[16px] border p-2.5 text-left transition-all duration-200",
        active
          ? "border-primary/40 bg-primary/8 shadow-[0_12px_28px_rgba(72,92,140,0.12)]"
          : "border-border/60 bg-white/70 hover:-translate-y-0.5 hover:border-primary/24"
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {mode === "default" ? "Default" : "Image"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
