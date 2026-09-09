import { type FC } from "react";
import { X, Zap, Clock, ShieldCheck, RefreshCw, Cpu } from "lucide-react";
import { TokenUsage } from "../types";

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionUsage?: TokenUsage;
  usage?: TokenUsage;
  onResetSession?: () => void;
  onResetUsage?: () => void;
  activeModelName?: string;
}

export const UsageModal: FC<UsageModalProps> = ({
  isOpen,
  onClose,
  sessionUsage: propSessionUsage,
  usage: propUsage,
  onResetSession,
  onResetUsage,
  activeModelName = "Active Session",
}) => {
  const sessionUsage = propSessionUsage || propUsage || {
    promptTokens: 0,
    completionTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costUSD: 0,
  };

  const handleReset = onResetSession || onResetUsage || (() => {});

  if (!isOpen) return null;

  // Calculate savings vs fixed $20/month flat subscription
  const cursorMonthlyPrice = 20.0;
  const currentCost = sessionUsage.costUSD;
  const savingsPercent = Math.max(0, Math.min(99.9, ((cursorMonthlyPrice - currentCost) / cursorMonthlyPrice) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-md bg-surface/95 dark:bg-[#111114]/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-elevated overflow-hidden animate-modal-sheet">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-center">
              <Zap className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Usage & Cost Analytics
              </h2>
              <p className="text-[11px] text-zinc-500 font-mono">
                Model: {activeModelName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all apple-tap"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Big Cost & Savings Hero Card */}
          <div className="p-4 rounded-xl bg-surface-elevated/80 dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Session Cost
              </span>
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5">
                ${sessionUsage.costUSD.toFixed(4)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 border border-black/[0.08] dark:border-white/[0.08]">
                Saved {savingsPercent.toFixed(1)}% vs $20/mo
              </span>
              <div className="text-[11px] text-zinc-500 mt-1">
                Direct-to-API sovereignty
              </div>
            </div>
          </div>

          {/* Detailed Token Metrics Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-surface-elevated/60 border border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1">
                <Cpu className="w-3.5 h-3.5" />
                <span>Prompt (Input)</span>
              </div>
              <div className="text-base font-semibold font-mono text-zinc-800 dark:text-zinc-200">
                {sessionUsage.promptTokens.toLocaleString()} <span className="text-xs text-zinc-500 font-normal">tok</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-elevated/60 border border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1">
                <Zap className="w-3.5 h-3.5" />
                <span>Completion (Output)</span>
              </div>
              <div className="text-base font-semibold font-mono text-zinc-800 dark:text-zinc-200">
                {sessionUsage.completionTokens.toLocaleString()} <span className="text-xs text-zinc-500 font-normal">tok</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-elevated/60 border border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Reasoning Depth</span>
              </div>
              <div className="text-base font-semibold font-mono text-zinc-800 dark:text-zinc-200">
                {(sessionUsage.reasoningTokens || 0).toLocaleString()} <span className="text-xs text-zinc-500 font-normal">tok</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-elevated/60 border border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Total Consumed</span>
              </div>
              <div className="text-base font-semibold font-mono text-zinc-800 dark:text-zinc-200">
                {sessionUsage.totalTokens.toLocaleString()} <span className="text-xs text-zinc-500 font-normal">tok</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all apple-tap-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Session Meter</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-xs font-medium hover:opacity-90 transition-all apple-tap active:scale-95 shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
