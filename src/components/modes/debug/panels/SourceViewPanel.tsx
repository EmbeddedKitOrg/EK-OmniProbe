import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { EditorView, gutter, GutterMarker } from "@codemirror/view";
import { useDebugStore } from "@/stores/debugStore";
import { useLogStore } from "@/stores/logStore";
import { debugReadSource } from "@/lib/debug";

class PcArrowMarker extends GutterMarker {
  toDOM() {
    const span = document.createElement("span");
    span.textContent = "▶";
    span.style.color = "#f59e0b";
    span.style.fontSize = "10px";
    return span;
  }
}

const PC_MARKER = new PcArrowMarker();

function makePcGutter(line: number | null) {
  return gutter({
    class: "cm-pc-gutter",
    lineMarker(_view, blockInfo) {
      if (line === null) return null;
      const docLine = _view.state.doc.lineAt(blockInfo.from).number;
      return docLine === line ? PC_MARKER : null;
    },
    initialSpacer: () => PC_MARKER,
  });
}

export function SourceViewPanel() {
  const frames = useDebugStore((s) => s.frames);
  const currentFrameId = useDebugStore((s) => s.currentFrameId);
  const currentFrame = frames.find((f) => f.id === currentFrameId) ?? null;
  const addLog = useLogStore((s) => s.addLog);

  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editorRef = useRef<ReactCodeMirrorRef | null>(null);

  // 当前 frame 的源文件变化 → 重新加载
  useEffect(() => {
    const targetPath = currentFrame?.file ?? null;
    if (!targetPath) {
      setContent("");
      setLoadedPath(null);
      setError(null);
      return;
    }
    if (targetPath === loadedPath) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    debugReadSource(targetPath)
      .then((res) => {
        if (cancelled) return;
        setContent(res.content);
        setLoadedPath(res.path);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = String(err);
        setError(msg);
        setContent("");
        setLoadedPath(null);
        addLog("warn", `读源文件失败: ${msg}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentFrame?.file, loadedPath, addLog]);

  // 滚动到 PC 行
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view || !currentFrame?.line) return;
    const lineNum = currentFrame.line;
    if (lineNum > view.state.doc.lines) return;
    const linePos = view.state.doc.line(lineNum);
    view.dispatch({
      effects: EditorView.scrollIntoView(linePos.from, { y: "center" }),
    });
  }, [content, currentFrame?.line]);

  const extensions = useMemo(() => [cpp(), makePcGutter(currentFrame?.line ?? null)], [currentFrame?.line]);

  const fileName = loadedPath ? loadedPath.split(/[\\/]/).pop() : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Source
          {fileName && (
            <span className="ml-2 normal-case tracking-normal text-foreground" title={loadedPath ?? ""}>
              {fileName}
              {currentFrame?.line && ` : ${currentFrame.line}`}
            </span>
          )}
        </span>
      </div>

      {!currentFrame?.file ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {currentFrame
            ? "当前帧无源码位置（PC 不在 DWARF 行表中或未加载 ELF）"
            : "halt 后从 Call Stack 选一帧查看源码"}
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">读取中...</div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-red-500">{error}</div>
      ) : (
        <div className="flex-1 overflow-hidden text-xs">
          <CodeMirror
            ref={editorRef}
            value={content}
            extensions={extensions}
            editable={false}
            readOnly
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
            }}
            height="100%"
            style={{ height: "100%", fontSize: "12px" }}
          />
        </div>
      )}
    </div>
  );
}
