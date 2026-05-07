import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell";
import { BadgeInfo, ExternalLink, Github, RefreshCw, UserRound, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UpdateChecker } from "@/components/UpdateChecker";

const AUTHOR_NAME = "左岚";
const BILIBILI_URL = "https://space.bilibili.com/27619688";
const PROJECT_GITHUB_URL = "https://github.com/EmbeddedKitOrg/EK-OmniProbe";

async function openExternalLink(url: string) {
  try {
    await open(url);
  } catch (error) {
    console.error("打开外部链接失败:", error);
  }
}

export function AuthorAboutDialog() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch((error) => {
        console.error("获取版本号失败:", error);
      });
  }, []);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 rounded-full px-4" title="关于作者">
          <BadgeInfo className="h-4 w-4" />
          <span>关于作者</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl rounded-[32px] p-6 sm:p-7">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <UserRound className="h-5 w-5 text-primary" />
            关于作者
          </DialogTitle>
          <DialogDescription className="text-sm text-[hsl(var(--secondary-foreground))]/88">
            EK-OmniProbe 由左岚发起并长期维护，下方是作者主页与项目仓库的链接。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 pt-2">
          <section className="rounded-[24px] border border-border/60 bg-white/70 p-5 shadow-[0_12px_26px_rgba(73,93,142,0.08)]">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">作者</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{AUTHOR_NAME}</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              专注嵌入式工具链与桌面端开发，主导 EK-OmniProbe 的功能设计与核心实现。
            </p>
          </section>

          <section className="flex items-center justify-between gap-3 rounded-[24px] border border-border/60 bg-white/70 px-5 py-4 shadow-[0_12px_26px_rgba(73,93,142,0.08)]">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">当前版本</div>
              <div className="mt-1 font-mono text-sm font-medium text-foreground">
                {version ? `v${version}` : "加载中..."}
              </div>
            </div>
            <UpdateChecker
              autoCheck={false}
              trigger={
                <Button size="sm" variant="outline" className="gap-2 rounded-full px-4">
                  <RefreshCw className="h-4 w-4" />
                  <span>检查更新</span>
                </Button>
              }
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => openExternalLink(BILIBILI_URL)}
              className="group rounded-[24px] border border-border/60 bg-white/72 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_14px_28px_rgba(73,93,142,0.12)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Bilibili</span>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <div className="mt-2 break-all text-xs leading-5 text-muted-foreground">{BILIBILI_URL}</div>
            </button>

            <button
              type="button"
              onClick={() => openExternalLink(PROJECT_GITHUB_URL)}
              className="group rounded-[24px] border border-border/60 bg-white/72 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_14px_28px_rgba(73,93,142,0.12)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">项目 GitHub</span>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <div className="mt-2 break-all text-xs leading-5 text-muted-foreground">{PROJECT_GITHUB_URL}</div>
            </button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
