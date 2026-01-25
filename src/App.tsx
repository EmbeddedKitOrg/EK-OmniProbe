import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { FlashMode, RttMode, SerialMode } from "./components/modes";
import { SerialSidebar } from "./components/serial";
import { UdevPermissionDialog } from "./components/dialogs/UdevPermissionDialog";
import { useEffect, useCallback } from "react";
import { useLogStore } from "./stores/logStore";
import { useProbeStore } from "./stores/probeStore";
import { useRttStore } from "./stores/rttStore";
import { useAppStore } from "./stores/appStore";
import { useFlashStore } from "./stores/flashStore";
import { useUserActivity } from "./hooks/useUserActivity";
import { disconnect, initPacks } from "./lib/tauri";

function App() {
  const addLog = useLogStore((state) => state.addLog);
  const { connected, autoDisconnect, autoDisconnectTimeout, setConnected } = useProbeStore();
  const { isRunning: rttRunning } = useRttStore();
  const { flashing } = useFlashStore();
  const { mode, setMode } = useAppStore();
  const { isActive, timeRemainingSeconds } = useUserActivity(autoDisconnectTimeout);

  useEffect(() => {
    addLog("info", "ZUOLAN DAPLINK RTTVIEW工具已启动");
    addLog("info", "等待连接调试探针...");

    // Initialize: load imported Packs
    initPacks()
      .then((count) => {
        if (count > 0) {
          addLog("success", `已加载 ${count} 个芯片定义从 CMSIS-Pack`);
        }
      })
      .catch((error) => {
        addLog("warn", `加载 Pack 失败: ${error}`);
      });
  }, [addLog]);

  // Keyboard shortcuts: Ctrl+1 for Flash mode, Ctrl+2 for RTT mode, Ctrl+3 for Serial mode
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Ctrl+1: Switch to Flash mode
    if (e.ctrlKey && e.key === "1") {
      e.preventDefault();
      if (!flashing) {
        setMode("flash");
      }
    }

    // Ctrl+2: Switch to RTT mode
    if (e.ctrlKey && e.key === "2") {
      e.preventDefault();
      if (!flashing) {
        setMode("rtt");
      }
    }

    // Ctrl+3: Switch to Serial mode
    if (e.ctrlKey && e.key === "3") {
      e.preventDefault();
      if (!flashing) {
        setMode("serial");
      }
    }
  }, [flashing, setMode]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-disconnect logic
  useEffect(() => {
    // If auto-disconnect is disabled, not connected, or RTT is running, don't auto-disconnect
    if (!autoDisconnect || !connected || rttRunning) {
      return;
    }

    // If user is inactive, perform auto-disconnect
    if (!isActive) {
      handleAutoDisconnect();
    }
  }, [isActive, autoDisconnect, connected, rttRunning]);

  const handleAutoDisconnect = async () => {
    try {
      await disconnect();
      setConnected(false);
      addLog("info", `检测到 ${autoDisconnectTimeout / 1000} 秒无操作，已自动断开连接`);
    } catch (error) {
      addLog("error", `自动断开失败: ${error}`);
    }
  };

  // Show countdown hint (last 5 seconds)
  useEffect(() => {
    if (
      autoDisconnect &&
      connected &&
      !rttRunning &&
      timeRemainingSeconds > 0 &&
      timeRemainingSeconds <= 5
    ) {
      // Can add countdown UI hint here
      // e.g.: show a toast or display countdown in TopBar
    }
  }, [autoDisconnect, connected, rttRunning, timeRemainingSeconds]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: switch based on mode */}
        {mode === "serial" ? <SerialSidebar /> : <Sidebar />}

        {/* Mode content with transition animation */}
        <div className="flex-1 overflow-hidden relative">
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${
              mode === "flash" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            }`}
          >
            <FlashMode />
          </div>
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${
              mode === "rtt" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            }`}
          >
            <RttMode />
          </div>
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${
              mode === "serial" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            }`}
          >
            <SerialMode />
          </div>
        </div>
      </div>

      {/* USB 权限检查对话框 (仅 Linux) */}
      <UdevPermissionDialog />
    </div>
  );
}

export default App;
