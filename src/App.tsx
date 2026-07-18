import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { ModeSwitch } from "./components/layout/ModeSwitch";
import { FlashMode, RttMode, SerialMode, BluetoothMode, DebugMode } from "./components/modes";
import { SerialSidebar } from "./components/serial";
import { BleSidebar } from "./components/bluetooth";
import { UdevPermissionDialog } from "./components/dialogs/UdevPermissionDialog";
import { useEffect, useCallback, useMemo } from "react";
import { useLogStore } from "./stores/logStore";
import { useProbeStore } from "./stores/probeStore";
import { useRttStore } from "./stores/rttStore";
import { useSerialStore } from "./stores/serialStore";
import { useBluetoothStore } from "./stores/bluetoothStore";
import { useAppStore } from "./stores/appStore";
import { useFlashStore } from "./stores/flashStore";
import { useUserActivity } from "./hooks/useUserActivity";
import { disconnect, initPacks } from "./lib/tauri";
import { applyThemeSchemeToDocument } from "./lib/themeSchemes";
import { useThemeStore } from "./stores/themeStore";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useUiPreferencesStore } from "./stores/uiPreferencesStore";
import { ChartWorkspaceWindowPage } from "./components/rtt/ChartWorkspaceWindowPage";
import type { ChartWorkspaceSource } from "./lib/chartWorkspace";
import { Cpu } from "lucide-react";

function App() {
  const popupSource = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get("chart_workspace");
    if (value === "rtt" || value === "serial") {
      return value as ChartWorkspaceSource;
    }
    return null;
  }, []);

  if (popupSource) {
    return <ChartWorkspacePopupApp source={popupSource} />;
  }

  return <MainApp />;
}

function MainApp() {
  const addLog = useLogStore((state) => state.addLog);
  const connected = useProbeStore((s) => s.connected);
  const autoDisconnect = useProbeStore((s) => s.autoDisconnect);
  const autoDisconnectTimeout = useProbeStore((s) => s.autoDisconnectTimeout);
  const setConnected = useProbeStore((s) => s.setConnected);
  const rttRunning = useRttStore((s) => s.isRunning);
  const flashing = useFlashStore((s) => s.flashing);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const schemeId = useThemeStore((s) => s.schemeId);
  const backgroundMode = useUiPreferencesStore((s) => s.backgroundMode);
  const backgroundImagePath = useUiPreferencesStore((s) => s.backgroundImagePath);
  const backgroundImageOpacity = useUiPreferencesStore((s) => s.backgroundImageOpacity);
  const { isActive, timeRemainingSeconds } = useUserActivity(autoDisconnectTimeout);
  const backgroundImageUrl = useMemo(() => {
    if (backgroundMode !== "custom" || !backgroundImagePath) {
      return "";
    }

    return convertFileSrc(backgroundImagePath);
  }, [backgroundMode, backgroundImagePath]);

  useEffect(() => {
    applyThemeSchemeToDocument(schemeId);
  }, [schemeId]);

  useEffect(() => {
    addLog("info", "EK-OmniProbe 已启动");
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

  // 全局快捷键
  // Ctrl+1/2/3: 切换 Flash / RTT / Serial 模式
  // Ctrl+L:    清空当前模式数据
  // Ctrl+F:    聚焦当前模式搜索框
  // Space:     在 RTT 模式下切换图表暂停
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isInInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if (e.ctrlKey && e.key === "1") {
        if (isInInput) return;
        e.preventDefault();
        if (!flashing) setMode("flash");
        return;
      }

      if (e.ctrlKey && e.key === "2") {
        if (isInInput) return;
        e.preventDefault();
        if (!flashing) setMode("rtt");
        return;
      }

      if (e.ctrlKey && e.key === "3") {
        if (isInInput) return;
        e.preventDefault();
        if (!flashing) setMode("serial");
        return;
      }

      if (e.ctrlKey && e.key === "4") {
        if (isInInput) return;
        e.preventDefault();
        if (!flashing) setMode("bluetooth");
        return;
      }

      if (e.ctrlKey && e.key === "5") {
        if (isInInput) return;
        e.preventDefault();
        if (!flashing) setMode("debug");
        return;
      }

      // Ctrl+F：聚焦当前模式搜索框（即使在某些 input 中也允许，方便切焦点）
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        const target = document.querySelector<HTMLInputElement>("[data-shortcut-search]:not([disabled])");
        if (target) {
          e.preventDefault();
          target.focus();
          target.select();
        }
        return;
      }

      if (isInInput) return;

      // Ctrl+L：清空当前模式数据
      if (e.ctrlKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        if (mode === "rtt") {
          useRttStore.getState().clearLines();
        } else if (mode === "serial") {
          const serialState = useSerialStore.getState();
          serialState.clearLines();
          serialState.clearTerminalBuffer();
        } else if (mode === "bluetooth") {
          const bleState = useBluetoothStore.getState();
          bleState.clearLines();
          bleState.clearChartData();
        }
        return;
      }

      // Space：在 RTT 模式下切换图表暂停
      if (e.key === " " && mode === "rtt") {
        e.preventDefault();
        const rttState = useRttStore.getState();
        rttState.setChartPaused(!rttState.chartPaused);
        return;
      }
    },
    [flashing, mode, setMode]
  );

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
    if (autoDisconnect && connected && !rttRunning && timeRemainingSeconds > 0 && timeRemainingSeconds <= 5) {
      // Can add countdown UI hint here
      // e.g.: show a toast or display countdown in TopBar
    }
  }, [autoDisconnect, connected, rttRunning, timeRemainingSeconds]);

  return (
    <div className="app-shell relative h-screen overflow-hidden text-foreground">
      {backgroundImageUrl && (
        <div
          className="app-background-image"
          style={{
            backgroundImage: `url("${backgroundImageUrl}")`,
            opacity: backgroundImageOpacity,
          }}
        />
      )}

      <div className="ide-workbench relative z-[1] grid h-full grid-cols-[72px_minmax(0,1fr)] grid-rows-[56px_minmax(0,1fr)] gap-2 overflow-hidden p-3">
        <aside className="surface-shell row-span-2 flex min-h-0 flex-col items-center rounded-[14px] p-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(73,110,214,0.22)]">
            <Cpu className="h-4 w-4" />
          </div>
          <ModeSwitch orientation="vertical" className="mt-2" />
        </aside>

        <TopBar />

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_18rem] gap-2 overflow-hidden">
          <div className="mode-stack relative min-w-0 overflow-hidden rounded-[14px]">
            <div key={mode} className="mode-stage h-full">
              {mode === "flash" && <FlashMode />}
              {mode === "rtt" && <RttMode />}
              {mode === "serial" && <SerialMode />}
              {mode === "bluetooth" && <BluetoothMode />}
              {mode === "debug" && <DebugMode />}
            </div>
          </div>

          <div className="ide-inspector min-h-0 overflow-hidden">
            {mode === "serial" ? <SerialSidebar /> : mode === "bluetooth" ? <BleSidebar /> : <Sidebar />}
          </div>
        </div>
      </div>

      {/* USB 权限检查对话框 (仅 Linux) */}
      <UdevPermissionDialog />
    </div>
  );
}

function ChartWorkspacePopupApp({ source }: { source: ChartWorkspaceSource }) {
  const schemeId = useThemeStore((s) => s.schemeId);

  useEffect(() => {
    applyThemeSchemeToDocument(schemeId);
  }, [schemeId]);

  return <ChartWorkspaceWindowPage source={source} />;
}

export default App;
