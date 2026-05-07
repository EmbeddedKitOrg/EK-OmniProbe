import { useRttStore } from "@/stores/rttStore";
import { useRttStats } from "@/hooks/useRttEvents";
import { cn } from "@/lib/utils";

export function RttStatusBar() {
  const { isRunning, isPaused, upChannels, selectedChannel, lines } = useRttStore();
  const { bytesFormatted } = useRttStats();

  return (
    <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
      {/* 运行状态 */}
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            isRunning ? (isPaused ? "bg-yellow-500" : "bg-green-500 animate-pulse") : "bg-gray-500"
          )}
        />
        <span>{isRunning ? (isPaused ? "已暂停" : "运行中") : "已停止"}</span>
      </div>

      <div className="w-px h-3 bg-border" />

      {/* 通道信息 */}
      <div className="flex items-center gap-2">
        <span>通道:</span>
        <select
          value={selectedChannel}
          onChange={(e) => useRttStore.getState().selectChannel(Number(e.target.value))}
          className="bg-transparent border border-border rounded px-1 py-0.5 text-xs"
        >
          <option value={-1}>全部</option>
          {upChannels.map((ch) => (
            <option key={ch.index} value={ch.index}>
              {ch.index}: {ch.name || "(未命名)"}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1" />

      {/* 统计信息 */}
      <div className="flex items-center gap-4">
        <span>行数: {lines.length.toLocaleString()}</span>
        <span>接收: {bytesFormatted}</span>
      </div>
    </div>
  );
}
