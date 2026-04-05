import { open } from "@tauri-apps/plugin-shell";
import { BadgeInfo, ExternalLink, Github, UserRound, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 rounded-full px-4"
          title="关于作者"
        >
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
            EK-OmniProbe 由作者左岚发起与长期维护，下面提供作者主页和项目仓库入口。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 pt-2">
          <section className="rounded-[24px] border border-border/60 bg-white/70 p-5 shadow-[0_12px_26px_rgba(73,93,142,0.08)]">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              作者
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{AUTHOR_NAME}</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              嵌入式工具链与桌面工作流方向的持续维护者，负责 EK-OmniProbe 的产品演进与核心实现。
            </p>
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
              <div className="mt-2 break-all text-xs leading-5 text-muted-foreground">
                {BILIBILI_URL}
              </div>
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
              <div className="mt-2 break-all text-xs leading-5 text-muted-foreground">
                {PROJECT_GITHUB_URL}
              </div>
            </button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
