import { useState, type FC, type MouseEvent } from "react";
import { Brain, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

interface ThinkingBlockProps {
  reasoning: string;
  isStreaming?: boolean;
  durationMs?: number;
}

export const ThinkingBlock: FC<ThinkingBlockProps> = ({
  reasoning,
  isStreaming = false,
  durationMs,
}) => {
  const [isOpen, setIsOpen] = useState(isStreaming);
  const [copied, setCopied] = useState(false);

  const copyReasoning = (e: MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(reasoning);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const seconds = durationMs ? (durationMs / 1000).toFixed(1) : undefined;

  return (
    <div className="my-2 border border-black/[0.06] dark:border-white/[0.06] bg-surface/50 rounded-lg overflow-hidden transition-all duration-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors apple-tap-sm"
      >
        <div className="flex items-center gap-2">
          <Brain className={`w-3.5 h-3.5 transition-transform duration-300 ${isStreaming ? "text-zinc-800 dark:text-zinc-200 scale-105" : "text-zinc-500 dark:text-zinc-400"}`} />
          <span className={`font-mono text-[11px] font-medium tracking-tight ${isStreaming ? "text-shimmer font-semibold" : ""}`}>
            {isStreaming ? "Thinking" : `Thought for ${seconds ? `${seconds}s` : "a moment"}`}
          </span>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 ml-0.5">
              <span className="w-1 h-1 rounded-full bg-zinc-600 dark:bg-zinc-300 animate-breathing-dot-1" />
              <span className="w-1 h-1 rounded-full bg-zinc-600 dark:bg-zinc-300 animate-breathing-dot-2" />
              <span className="w-1 h-1 rounded-full bg-zinc-600 dark:bg-zinc-300 animate-breathing-dot-3" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {reasoning && !isStreaming && (
            <span
              onClick={copyReasoning}
              className="p-1 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] rounded transition-colors apple-tap"
              title="Copy reasoning trace"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            </span>
          )}
          <span className="transition-transform duration-200">
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="px-3.5 py-2.5 border-t border-black/[0.04] dark:border-white/[0.04] bg-black/[0.02] dark:bg-black/20 text-xs font-mono text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap selection:bg-black/10 dark:selection:bg-white/10 max-h-80 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
          {reasoning}
          {isStreaming && <span className="inline-block w-1.5 h-3.5 bg-zinc-500 dark:bg-zinc-400 ml-1 animate-pulse align-middle" />}
        </div>
      )}
    </div>
  );
};
