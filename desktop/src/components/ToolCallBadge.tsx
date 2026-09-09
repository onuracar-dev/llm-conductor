import { useState, useEffect, type FC } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  FileEdit,
  Terminal,
  FolderTree,
  ChevronRight,
  Check,
  AlertCircle,
  Loader2,
  Clock,
  Globe,
  Eye,
  Maximize2,
  X,
  Play,
  Search,
  BookOpen,
  ShieldAlert,
  Network,
  ExternalLink,
} from "lucide-react";
import { ToolCallRecord } from "../types";
import { fastBrowserEngine } from "../services/fastBrowser";
import { openExternalUrl } from "../services/tauriFs";

interface ToolCallBadgeProps {
  toolCall: ToolCallRecord;
}

export const ToolCallBadge: FC<ToolCallBadgeProps> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Extract screenshot, networkSummary, and preFlightRequired from result if present
  const resultObj =
    typeof toolCall.result === "object" && toolCall.result !== null
      ? (toolCall.result as Record<string, any>)
      : null;
  const screenshot: string | null =
    resultObj?.screenshot && typeof resultObj.screenshot === "string"
      ? resultObj.screenshot
      : null;
  const networkSummary = Array.isArray(resultObj?.networkSummary)
    ? resultObj.networkSummary
    : Array.isArray((resultObj?.data as any)?.exchanges)
    ? (resultObj?.data as any)?.exchanges
    : null;
  const preFlightRequired = resultObj?.preFlightRequired as any | undefined;

  const pageUrl: string =
    toolCall.args?.target ||
    toolCall.args?.url ||
    (resultObj?.data as any)?.url ||
    (typeof resultObj?.url === "string" ? resultObj.url : "");

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsLightboxOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen]);

  const getToolIcon = (name: string) => {
    switch (name) {
      case "fast_browser_action": {
        const action = toolCall.args?.action;
        if (action === "search_and_select") return <Search className="w-3.5 h-3.5 text-blue-500" />;
        if (action === "control_media") return <Play className="w-3.5 h-3.5 text-emerald-500" />;
        if (action === "extract_readable_text") return <BookOpen className="w-3.5 h-3.5 text-amber-500" />;
        if (action === "screenshot") return <Eye className="w-3.5 h-3.5 text-indigo-500" />;
        return <Globe className="w-3.5 h-3.5 text-blue-500" />;
      }
      case "read_file":
        return <FileText className="w-3.5 h-3.5 text-zinc-500" />;
      case "write_file":
        return <FileEdit className="w-3.5 h-3.5 text-zinc-500" />;
      case "run_command":
        return <Terminal className="w-3.5 h-3.5 text-zinc-500" />;
      case "list_files":
        return <FolderTree className="w-3.5 h-3.5 text-zinc-500" />;
      default:
        return <Terminal className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const getStatusBadge = (status: ToolCallRecord["status"]) => {
    switch (status) {
      case "running":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
            <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
            <span>Running</span>
          </span>
        );
      case "completed":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
            <Check className="w-3 h-3" />
            <span>Completed</span>
          </span>
        );
      case "awaiting_approval":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-amber-600 dark:text-amber-400">
            <Clock className="w-3 h-3" />
            <span>Needs approval</span>
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
    }
  };

  const getSummary = () => {
    const args = toolCall.args || {};
    if (toolCall.name === "fast_browser_action") {
      const action = String(args.action || "action");
      const target = args.target ? String(args.target) : "";
      const val = args.value ? String(args.value) : "";
      return `${action}${target ? ` (${target})` : ""}${val ? ` "${val}"` : ""}`;
    }
    if (toolCall.name === "read_file") {
      return String(args.path || "");
    }
    if (toolCall.name === "write_file") {
      return String(args.path || "");
    }
    if (toolCall.name === "run_command") {
      return String(args.command || "");
    }
    if (toolCall.name === "list_files") {
      return args.path ? String(args.path) : "workspace root";
    }
    return JSON.stringify(args);
  };

  // Clone result without massive base64 string to keep JSON output clean
  const displayResult = (() => {
    if (!resultObj) return toolCall.result;
    const { screenshot: _, ...rest } = resultObj;
    return rest;
  })();

  const formattedResult =
    typeof displayResult === "string"
      ? displayResult
      : displayResult !== undefined
      ? JSON.stringify(displayResult, null, 2)
      : null;

  return (
    <div className="my-2 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-surface/80 overflow-hidden text-xs font-mono shadow-subtle transition-all">
      {/* Header Button */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left apple-tap-sm"
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <ChevronRight
            className={`w-3 h-3 text-zinc-400 transition-transform duration-200 shrink-0 ${
              isExpanded ? "rotate-90 text-zinc-700 dark:text-zinc-300" : ""
            }`}
          />
          {getToolIcon(toolCall.name)}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 shrink-0">
            {toolCall.name}
          </span>
          <span className="text-zinc-500 truncate max-w-xs text-[11px]">
            {getSummary()}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {screenshot && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLightboxOpen(true);
              }}
              className="flex items-center gap-1 text-[10px] text-zinc-700 dark:text-zinc-300 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] px-2 py-0.5 rounded transition-all apple-tap-sm border border-black/[0.06] dark:border-white/[0.06]"
              title="Click to view vision snapshot in fullscreen (Esc)"
            >
              <Eye className="w-2.5 h-2.5 text-zinc-500" />
              <span>Vision Snapshot</span>
            </button>
          )}
          {getStatusBadge(toolCall.status)}
        </div>
      </button>

      {/* Vision Snapshot Thumbnail Preview - ONLY when user expands details */}
      {isExpanded && screenshot && (
        <div className="px-3.5 py-2 bg-black/[0.01] dark:bg-white/[0.01] border-t border-black/[0.04] dark:border-white/[0.04]">
          <div className="flex items-center justify-between mb-1.5 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1 font-medium text-zinc-600 dark:text-zinc-400">
              <Eye className="w-3 h-3 text-zinc-500" />
              <span>Vision Snapshot (Chrome CDP)</span>
            </span>
            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              className="hover:text-zinc-900 dark:hover:text-zinc-200 flex items-center gap-1 transition-colors apple-tap-sm"
            >
              <Maximize2 className="w-2.5 h-2.5" />
              <span>Expand</span>
            </button>
          </div>

          <div
            onClick={() => setIsLightboxOpen(true)}
            className="relative group cursor-pointer rounded-lg overflow-hidden border border-black/[0.08] dark:border-white/[0.08] max-h-48 bg-black/5 dark:bg-black/40 flex items-center justify-center transition-all hover:border-black/20 dark:hover:border-white/20"
          >
            <img
              src={screenshot}
              alt="Browser Vision Snapshot"
              className="w-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.01]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="bg-black/80 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-[11px] font-sans flex items-center gap-1.5 shadow-lg border border-white/10">
                <Maximize2 className="w-3 h-3" />
                <span>View Fullscreen</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Flight Dry-Run Interception Card */}
      {preFlightRequired && (
        <div className="mx-3.5 my-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/15 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200 font-semibold text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>Dry-Run Pre-Flight Interception</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-100 uppercase font-bold">
              {preFlightRequired.method} Paused
            </span>
          </div>
          <p className="text-[11px] text-zinc-700 dark:text-zinc-300 break-all font-mono">
            {preFlightRequired.url}
          </p>
          {preFlightRequired.postData && (
            <pre className="p-2 rounded bg-black/5 dark:bg-black/40 text-[10px] font-mono text-zinc-700 dark:text-zinc-300 overflow-x-auto max-h-24">
              {preFlightRequired.postData}
            </pre>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={async () => {
                await fastBrowserEngine.approvePreFlight(preFlightRequired.requestId);
              }}
              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-colors"
            >
              Approve & Send
            </button>
            <button
              type="button"
              onClick={async () => {
                await fastBrowserEngine.rejectPreFlight(preFlightRequired.requestId);
              }}
              className="px-3 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-700 dark:text-rose-300 font-medium text-xs transition-colors"
            >
              Reject (Block)
            </button>
          </div>
        </div>
      )}

      {/* Network-First Reverse Scraping Summary Card - ONLY when expanded */}
      {isExpanded && networkSummary && networkSummary.length > 0 && (
        <div className="mx-3.5 my-2 p-2.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-xs">
          <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-medium text-[11px] mb-1.5">
            <Network className="w-3.5 h-3.5 text-zinc-500" />
            <span>Captured Network APIs ({networkSummary.length} RAM JSON endpoints)</span>
          </div>
          <div className="space-y-1 font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
            {networkSummary.slice(0, 3).map((item: any, idx: number) => (
              <div key={idx} className="truncate flex items-center gap-1.5">
                <span className="text-zinc-800 dark:text-zinc-200 font-bold">{item.status || 200}</span>
                <span className="truncate">{item.url}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expanded Details Drawer */}
      {isExpanded && (
        <div className="border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-3 space-y-2.5">
          <div>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
              Parameters
            </div>
            <pre className="p-2.5 rounded-lg bg-black/[0.04] dark:bg-black/30 border border-black/[0.06] dark:border-white/[0.06] text-[11px] text-zinc-700 dark:text-zinc-300 overflow-x-auto leading-relaxed">
              <code>{JSON.stringify(toolCall.args, null, 2)}</code>
            </pre>
          </div>

          {formattedResult && (
            <div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                Output
              </div>
              <pre className="p-2.5 rounded-lg bg-black/[0.04] dark:bg-black/30 border border-black/[0.06] dark:border-white/[0.06] text-[11px] text-zinc-700 dark:text-zinc-300 overflow-x-auto max-h-56 overflow-y-auto leading-relaxed">
                <code>{formattedResult}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Vision Snapshot Lightbox Modal (Teleported to document.body via Portal) */}
      {isLightboxOpen && screenshot && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 md:p-10 animate-in fade-in duration-150 select-none"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] bg-surface-elevated dark:bg-[#121215] rounded-2xl overflow-hidden border border-black/[0.1] dark:border-white/[0.12] shadow-2xl flex flex-col animate-modal-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/[0.02] dark:bg-white/[0.03] border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0" />
                <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Browser Vision Snapshot
                </span>
                <span className="text-[11px] text-zinc-500 font-mono truncate max-w-md">
                  {getSummary()}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pageUrl && (
                  <button
                    type="button"
                    onClick={() => openExternalUrl(pageUrl)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-all apple-tap-sm border border-black/[0.06] dark:border-white/[0.08]"
                    title="Open this URL in native Chrome"
                  >
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                    <span className="hidden sm:inline">Open in Chrome</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(false)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all apple-tap"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Image View - Natural scroll starting cleanly from top */}
            <div className="flex-1 min-h-0 overflow-auto p-4 bg-black/[0.04] dark:bg-black/60 flex items-start justify-center">
              <img
                src={screenshot}
                alt="Fullscreen Browser Snapshot"
                className="max-w-full h-auto object-contain rounded-xl border border-black/[0.08] dark:border-white/[0.08] shadow-elevated block"
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
