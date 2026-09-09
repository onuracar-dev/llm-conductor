import React, { useState, useEffect, useRef } from "react";
import {
  Globe,
  X,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  ExternalLink,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
} from "lucide-react";
import { fastBrowserEngine } from "../services/fastBrowser";
import { openExternalUrl, isBrowserCdpReady } from "../services/tauriFs";

interface BrowserPreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrowserPreviewPanel: React.FC<BrowserPreviewPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [currentUrl, setCurrentUrl] = useState<string>(fastBrowserEngine.getUrl());
  const [inputUrl, setInputUrl] = useState<string>(fastBrowserEngine.getUrl());
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(
    fastBrowserEngine.getLastScreenshot()
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [showExtractedModal, setShowExtractedModal] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const pollTimerRef = useRef<any>(null);

  // Sync state and start live polling when panel is open
  useEffect(() => {
    if (!isOpen) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const refreshFrame = async () => {
      try {
        const cdpReady = await isBrowserCdpReady().catch(() => false);
        const url = fastBrowserEngine.getUrl();
        setCurrentUrl(url);

        if (cdpReady) {
          const shot = await fastBrowserEngine.captureScreenshot(60).catch(() => "");
          if (shot) setLiveScreenshot(shot);
        }
      } catch {
        // Ignored
      }
    };

    refreshFrame();
    pollTimerRef.current = setInterval(refreshFrame, 1500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    setInputUrl(currentUrl);
  }, [currentUrl]);

  if (!isOpen) return null;

  const handleNavigate = async (urlToNavigate: string) => {
    let target = urlToNavigate.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = target.includes(".") ? `https://${target}` : `https://www.google.com/search?q=${encodeURIComponent(target)}`;
    }
    setIsLoading(true);
    try {
      await fastBrowserEngine.navigate(target);
      setCurrentUrl(target);
      setInputUrl(target);
      const shot = await fastBrowserEngine.captureScreenshot(65);
      if (shot) setLiveScreenshot(shot);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const xRatio = Math.max(0, Math.min(1, clickX / rect.width));
    const yRatio = Math.max(0, Math.min(1, clickY / rect.height));

    setIsLoading(true);
    try {
      await fastBrowserEngine.clickAtRatio(xRatio, yRatio);
      const shot = await fastBrowserEngine.captureScreenshot(65);
      if (shot) setLiveScreenshot(shot);
      setCurrentUrl(fastBrowserEngine.getUrl());
    } finally {
      setIsLoading(false);
    }
  };

  const handleMediaControl = async (action: "play" | "pause" | "mute") => {
    await fastBrowserEngine.controlMedia(action);
    if (action === "play") setIsPlaying(true);
    if (action === "pause") setIsPlaying(false);
    if (action === "mute") setIsMuted(!isMuted);
    const shot = await fastBrowserEngine.captureScreenshot(60);
    if (shot) setLiveScreenshot(shot);
  };

  const handleScroll = async (dir: "up" | "down") => {
    await fastBrowserEngine.scroll(dir, 500);
    const shot = await fastBrowserEngine.captureScreenshot(60);
    if (shot) setLiveScreenshot(shot);
  };

  const handleExtractText = async () => {
    setIsLoading(true);
    try {
      const res = await fastBrowserEngine.extractReadableText();
      if (res.success && res.data) {
        setExtractedText((res.data as any).text || "No readable content extracted.");
        setShowExtractedModal(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="w-[440px] xl:w-[500px] h-full border-l border-black/[0.08] dark:border-white/[0.08] bg-surface/95 dark:bg-[#0d0d10]/95 backdrop-blur-xl flex flex-col z-20 shadow-2xl animate-in slide-in-from-right duration-200 select-none">
      {/* 1. Header Toolbar (Apple Minimalist / Dieter Rams) */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01]">
        <div className="flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Live Browser
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openExternalUrl(currentUrl)}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all apple-tap-sm"
            title="Open in Native Chrome Window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all apple-tap-sm"
            title="Close Browser Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Omnibox / Navigation Controls */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.04] bg-surface">
        <button
          type="button"
          onClick={() => fastBrowserEngine.goBack()}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all apple-tap-sm"
          title="Back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => fastBrowserEngine.goForward()}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all apple-tap-sm"
          title="Forward"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleNavigate(currentUrl)}
          className={`p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all apple-tap-sm ${
            isLoading ? "animate-spin text-zinc-700 dark:text-zinc-300" : ""
          }`}
          title="Refresh"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNavigate(inputUrl);
          }}
          className="flex-1 flex items-center"
        >
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Enter URL or search query..."
            className="w-full px-3 py-1 text-xs font-mono rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors truncate"
          />
        </form>
      </div>

      {/* 3. Live Canvas / Screen View */}
      <div className="flex-1 overflow-auto bg-black/[0.03] dark:bg-black/40 relative flex items-start justify-center p-2">
        {liveScreenshot ? (
          <div className="relative w-full max-w-full rounded-xl overflow-hidden border border-black/[0.08] dark:border-white/[0.08] shadow-subtle group">
            <img
              ref={imgRef}
              src={liveScreenshot}
              alt="Live Browser Stream"
              onClick={handleImageClick}
              className="w-full h-auto object-contain cursor-crosshair select-none block"
            />
            {isLoading && (
              <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/80 text-white text-[11px] font-mono shadow-lg">
                  <RotateCw className="w-3 h-3 animate-spin" />
                  <span>Syncing CDP...</span>
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
            <Globe className="w-8 h-8 mb-2 opacity-40 animate-pulse" />
            <span className="text-xs font-medium">Connecting to live Chrome CDP session...</span>
            <span className="text-[10px] mt-1 text-zinc-500 font-mono">
              Port 9222 (Session Tethered)
            </span>
          </div>
        )}
      </div>

      {/* 4. Bottom Quick Action Control Island */}
      <div className="px-3 py-2.5 border-t border-black/[0.06] dark:border-white/[0.06] bg-surface flex items-center justify-between gap-1 text-xs font-mono">
        {/* Media Controls */}
        <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.04] p-1 rounded-lg border border-black/[0.06] dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => handleMediaControl(isPlaying ? "pause" : "play")}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 transition-colors"
            title={isPlaying ? "Pause Video" : "Play Video"}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => handleMediaControl("mute")}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 transition-colors"
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Scroll Controls */}
        <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.04] p-1 rounded-lg border border-black/[0.06] dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => handleScroll("up")}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 transition-all apple-tap-sm"
            title="Scroll Up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleScroll("down")}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 transition-all apple-tap-sm"
            title="Scroll Down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* AI Page Extract */}
        <button
          type="button"
          onClick={handleExtractText}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium transition-all apple-tap-sm"
          title="Extract clean page text with AI reader"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Clean Text</span>
        </button>
      </div>

      {/* Extracted Text Modal */}
      {showExtractedModal && extractedText && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowExtractedModal(false)}
        >
          <div
            className="max-w-2xl w-full max-h-[80vh] bg-surface rounded-2xl border border-black/[0.08] dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden animate-modal-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                  Clean Extracted Text
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowExtractedModal(false)}
                className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {extractedText}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
