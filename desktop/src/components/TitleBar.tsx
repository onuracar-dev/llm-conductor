import { useState, useEffect, type FC } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Code2,
  Settings as SettingsIcon,
  RotateCcw,
  Minus,
  Square,
  Copy,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { SidebarToggleIcon } from "./SidebarToggleIcon";
import { SecurityLevel } from "../types";
import logoDark from "../assets/logo-dark.png";
import logoLight from "../assets/logo-light.png";

interface TitleBarProps {
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onClearHistory: () => void;
  hasMessages: boolean;
  theme: "dark" | "light";
  onToggleTheme: (event: React.MouseEvent<HTMLButtonElement>) => void;
  workspacePath?: string;
  isWorkspaceOpen?: boolean;
  onToggleWorkspace: () => void;
  securityLevel?: SecurityLevel;
}

export const TitleBar: FC<TitleBarProps> = ({
  onOpenSettings,
  onOpenExport,
  onClearHistory,
  hasMessages,
  theme,
  onToggleTheme,
  workspacePath,
  isWorkspaceOpen,
  onToggleWorkspace,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    if (isTauri) {
      try {
        const appWindow = getCurrentWindow();
        appWindow.isMaximized().then(setIsMaximized).catch(() => {});
        appWindow.onResized(async () => {
          try {
            setIsMaximized(await appWindow.isMaximized());
          } catch {}
        });
      } catch {}
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const handleMinimize = async () => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      try {
        await getCurrentWindow().minimize();
      } catch (err) {
        console.error("Tauri minimize error:", err);
      }
    } else {
      showToast("Pencere simge durumuna küçültme yerel masaüstü penceresi (Tauri) içindir.");
    }
  };

  const handleMaximize = async () => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      try {
        await getCurrentWindow().toggleMaximize();
        setIsMaximized(await getCurrentWindow().isMaximized());
      } catch (err) {
        console.error("Tauri toggleMaximize error:", err);
      }
    } else {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          setIsMaximized(true);
        } else {
          await document.exitFullscreen();
          setIsMaximized(false);
        }
      } catch {
        showToast("Tarayıcı tam ekran geçişine izin vermedi.");
      }
    }
  };

  const handleClose = async () => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      try {
        await getCurrentWindow().close();
      } catch (err) {
        console.error("Tauri close error:", err);
      }
    } else {
      showToast("Uygulamayı kapatma yerel masaüstü penceresi (Tauri) içindir.");
    }
  };

  const workspaceFolderName = workspacePath
    ? workspacePath.replace(/\\/g, "/").split("/").filter(Boolean).pop()
    : null;

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={handleMaximize}
      className="relative h-11 w-full flex items-center justify-between px-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-surface/80 backdrop-blur-md select-none shrink-0 z-50 text-zinc-900 dark:text-zinc-100"
    >
      {/* Left: Branding & Workspace Pill */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 flex items-center justify-center shrink-0 select-none">
          <img
            src={theme === "dark" ? logoDark : logoLight}
            alt="Conductor Logo"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex items-center gap-1.5 mr-1">
          <span className="font-medium text-xs tracking-wide text-zinc-800 dark:text-zinc-200">Conductor</span>
        </div>

        {/* Apple/Cursor Minimalist Sidebar Toggle */}
        <button
          type="button"
          onClick={onToggleWorkspace}
          className={`flex items-center justify-center p-1.5 rounded-lg transition-all border ${
            isWorkspaceOpen
              ? "bg-black/[0.08] dark:bg-white/[0.12] border-black/[0.16] dark:border-white/[0.2] text-zinc-900 dark:text-zinc-100 shadow-sm"
              : "bg-black/[0.04] dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.1] text-zinc-700 dark:text-zinc-300 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"
          }`}
          title={`${isWorkspaceOpen ? "Collapse" : "Open"} Sidebar (Files & Project Chats)`}
        >
          <SidebarToggleIcon isOpen={Boolean(isWorkspaceOpen)} className="w-4 h-4" />
        </button>

        {/* Minimalist Workspace Breadcrumb */}
        {workspaceFolderName && (
          <span
            className="text-xs font-mono text-zinc-500 dark:text-zinc-400 select-none tracking-tight truncate max-w-[180px]"
            title={workspacePath}
          >
            /{workspaceFolderName}
          </span>
        )}
      </div>

      {/* Center: Clean Drag Region Spacer (Zero AI-Slop, No Mid-Navbar Clutter) */}
      <div className="flex-1 h-full" data-tauri-drag-region />

      {/* Right: Actions & Custom Top-Right Window Controls */}
      <div className="flex items-center gap-1">
        {hasMessages && (
          <button
            onClick={onClearHistory}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-white/[0.05] rounded-md transition-all apple-tap group"
            title="Clear conversation"
          >
            <RotateCcw className="w-3.5 h-3.5 transition-transform duration-300 group-hover:-rotate-45" />
          </button>
        )}

        <button
          onClick={onOpenExport}
          className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-white/[0.05] rounded-md transition-all font-mono text-[11px] apple-tap group"
          title="Export as Conductor TypeScript code"
        >
          <Code2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />
          <span className="hidden sm:inline">Code</span>
        </button>

        {/* Creative Theme Wave Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.05] rounded-md transition-all group active:scale-90 apple-tap"
          title={theme === "dark" ? "Switch to Light mode (Wave reveal)" : "Switch to Dark mode (Wave reveal)"}
        >
          {theme === "dark" ? (
            <Sun className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-45 text-zinc-400 group-hover:text-amber-300" />
          ) : (
            <Moon className="w-3.5 h-3.5 transition-transform duration-300 group-hover:-rotate-12 text-zinc-600 group-hover:text-zinc-900" />
          )}
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-white/[0.05] rounded-md transition-all apple-tap group"
          title="Settings & API Keys"
        >
          <SettingsIcon className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-45" />
        </button>

        <div className="h-4 w-[1px] bg-black/[0.08] dark:bg-white/[0.08] mx-1" />

        {/* Custom Window Controls (Top-Right) */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.06] dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.08] rounded-md transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.06] dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.08] rounded-md transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Copy className="w-2.5 h-2.5 rotate-90" />
            ) : (
              <Square className="w-2.5 h-2.5" />
            )}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-rose-500/90 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-rose-500/90 rounded-md transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Elegant Toast Feedback for Action Hints */}
      {toastMessage && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-xl bg-zinc-900/90 text-white dark:bg-zinc-100/90 dark:text-zinc-950 text-xs font-sans shadow-elevated border border-white/10 dark:border-black/10 z-50 animate-in fade-in zoom-in-95 duration-150 select-none pointer-events-none backdrop-blur-md">
          {toastMessage}
        </div>
      )}
    </header>
  );
};
