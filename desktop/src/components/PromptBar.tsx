import { useRef, useEffect, useState, type FC, type KeyboardEvent } from "react";
import {
  ArrowUp,
  Square,
  CornerDownLeft,
  Brain,
  ChevronDown,
  Check,
  Sparkles,
  Zap,
  ListOrdered,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  X,
} from "lucide-react";
import { ModelOption, ProviderKey } from "../types";
import {
  CURATED_GEMINI_MODELS,
  fetchLiveGeminiModels,
  GeminiModelInfo,
} from "../services/geminiApi";

interface PromptBarProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onSteer?: (text: string) => void;
  onQueue?: (text: string) => void;
  queuedCount?: number;
  isStreaming: boolean;
  currentModel: ModelOption;
  availableModels?: ModelOption[];
  onSelectModel?: (modelId: string) => void;
  onAddCustomModel?: (model: ModelOption) => void;
  onRemoveCustomModel?: (modelId: string) => void;
  geminiModel?: string;
  onSelectGeminiModel?: (model: string) => void;
  geminiKey?: string;
  onOpenSettings?: () => void;
  activeModelName?: string;
  disabled?: boolean;
  reasoningEnabled?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  onToggleReasoning?: () => void;
  onChangeReasoningEffort?: (effort: "low" | "medium" | "high") => void;
  onDisableReasoning?: () => void;
}

export const PromptBar: FC<PromptBarProps> = ({
  input,
  setInput,
  onSubmit,
  onStop,
  onSteer,
  onQueue,
  queuedCount,
  isStreaming,
  currentModel,
  availableModels,
  onSelectModel,
  onAddCustomModel,
  onRemoveCustomModel,
  geminiModel,
  onSelectGeminiModel,
  geminiKey,
  onOpenSettings,
  activeModelName,
  disabled,
  reasoningEnabled = true,
  reasoningEffort = "medium",
  onChangeReasoningEffort,
  onDisableReasoning,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);

  // Custom model adding inline state
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [newModelId, setNewModelId] = useState("");
  const [newModelProvider, setNewModelProvider] = useState<ProviderKey>("openai");
  const [newModelReasoning, setNewModelReasoning] = useState(false);
  const [geminiList, setGeminiList] = useState<GeminiModelInfo[]>(CURATED_GEMINI_MODELS);
  const [isScanningGemini, setIsScanningGemini] = useState(false);

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsThinkingOpen(false);
      }
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    if (isThinkingOpen || isModelDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isThinkingOpen, isModelDropdownOpen]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim()) return;
      if (isStreaming) {
        if (onSteer) {
          onSteer(input);
          setInput("");
        }
      } else {
        onSubmit();
      }
    }
  };

  const handleSelectLevel = (level: "off" | "low" | "medium" | "high") => {
    setSelectedEffectId(level);
    setIsPulsing(true);

    if (level === "off") {
      onDisableReasoning?.();
    } else {
      onChangeReasoningEffort?.(level);
    }

    setTimeout(() => {
      setIsThinkingOpen(false);
      setSelectedEffectId(null);
      setIsPulsing(false);
    }, 180);
  };

  const handleScanGemini = async () => {
    if (!geminiKey?.trim()) {
      onOpenSettings?.();
      return;
    }
    setIsScanningGemini(true);
    try {
      const live = await fetchLiveGeminiModels(geminiKey);
      if (live.length > 0) {
        setGeminiList(live);
        if (!live.some((m) => m.id === geminiModel)) {
          onSelectGeminiModel?.(live[0].id);
        }
      }
    } catch (e) {
      console.warn("Scan failed:", e);
    } finally {
      setIsScanningGemini(false);
    }
  };

  const displayModelTitle = (() => {
    if (currentModel.provider === "gemini") {
      const id = geminiModel || "gemini-3.8-flash";
      if (id.includes("3.8")) return "Gemini 3.8 Flash";
      if (id.includes("3.7")) return "Gemini 3.7 Flash";
      if (id.includes("3.1")) return "Gemini 3.1 Pro";
      if (id.includes("2.5-pro")) return "Gemini 2.5 Pro";
      if (id.includes("2.5-flash")) return "Gemini 2.5 Flash";
      return `Gemini (${id})`;
    }
    return activeModelName || currentModel.name;
  })();

  const models = availableModels && availableModels.length > 0 ? availableModels : [currentModel];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 shrink-0 relative z-40">
      <div className="frosted-input rounded-xl transition-all duration-200 shadow-elevated p-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? "AI is active... Type to steer (Enter) or queue next message..."
              : `Message ${displayModelTitle}...`
          }
          rows={1}
          disabled={disabled && !isStreaming}
          className="w-full bg-transparent resize-none text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none px-2 pt-1 pb-2 leading-relaxed selection:bg-black/10 dark:selection:bg-white/10"
        />

        <div className="flex items-center justify-between px-1 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
          {/* Model info & Thinking selectors */}
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
            {/* Interactive Model Selector Pill & Upward Popover */}
            <div className="relative" ref={modelSelectorRef}>
              <button
                type="button"
                onClick={() => {
                  setIsModelDropdownOpen((prev) => !prev);
                  setIsThinkingOpen(false);
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.06] hover:border-black/[0.12] dark:hover:border-white/[0.12] text-zinc-700 dark:text-zinc-300 transition-all font-mono text-[11px] group cursor-pointer active:scale-95"
                title="Switch AI Model or Provider"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 shrink-0" />
                <span className="font-medium truncate max-w-[130px] text-zinc-800 dark:text-zinc-200">
                  {displayModelTitle}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-transform duration-150 shrink-0 ${
                    isModelDropdownOpen ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>

              {/* Upward Compact Model Popover */}
              {isModelDropdownOpen && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute bottom-full mb-2 left-0 w-72 max-h-[380px] bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.08] rounded-xl shadow-2xl p-1.5 z-50 text-xs select-none animate-in fade-in zoom-in-95 duration-100 flex flex-col"
                >
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-black/[0.04] dark:border-white/[0.04] mb-1">
                    <span>Select Model</span>
                    <span className="text-[9px] text-zinc-400">
                      {models.length} models
                    </span>
                  </div>

                  <div className="space-y-0.5 overflow-y-auto max-h-48 pr-0.5">
                    {models.map((model) => {
                      const isSelected = model.id === currentModel.id;
                      return (
                        <div
                          key={model.id}
                          onClick={() => {
                            onSelectModel?.(model.id);
                            setIsModelDropdownOpen(false);
                          }}
                          className={`group w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-black/[0.05] dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-100 font-medium"
                              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex flex-col pr-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span
                                className={`text-[11px] truncate ${
                                  isSelected
                                    ? "font-semibold text-zinc-900 dark:text-white"
                                    : ""
                                }`}
                              >
                                {model.name}
                              </span>
                              {model.supportsReasoning && (
                                <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400 border border-black/[0.06] dark:border-white/[0.08] shrink-0">
                                  thinking
                                </span>
                              )}
                              {model.isCustom && (
                                <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400 border border-black/[0.06] dark:border-white/[0.08] shrink-0">
                                  custom
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[190px]">
                              {model.description}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100" />
                            )}
                            {model.isCustom && onRemoveCustomModel && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveCustomModel(model.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-rose-500 transition-opacity rounded"
                                title="Delete custom model"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Gemini Variant Picker */}
                  {currentModel.provider === "gemini" && (
                    <div className="mt-1 pt-1 border-t border-black/[0.05] dark:border-white/[0.05] px-1">
                      <div className="flex items-center justify-between py-0.5 text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                        <span>Gemini Variant</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleScanGemini();
                          }}
                          disabled={isScanningGemini}
                          className="flex items-center gap-1 text-[9px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`w-2.5 h-2.5 ${isScanningGemini ? "animate-spin" : ""}`}
                          />
                          <span>Scan</span>
                        </button>
                      </div>
                      <div className="space-y-0.5 max-h-24 overflow-y-auto pr-0.5">
                        {geminiList.map((m) => {
                          const isSelected = (geminiModel || "gemini-3.8-flash") === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectGeminiModel?.(m.id);
                                setIsModelDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-1.5 py-1 rounded text-left text-[10px] font-mono transition-colors ${
                                isSelected
                                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                                  : "text-zinc-600 dark:text-zinc-400 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                              }`}
                            >
                              <span className="truncate">{m.id}</span>
                              {isSelected && (
                                <Check className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add Custom Model */}
                  <div className="mt-1 pt-1 border-t border-black/[0.05] dark:border-white/[0.05]">
                    {!isAddingCustom ? (
                      <button
                        type="button"
                        onClick={() => setIsAddingCustom(true)}
                        className="w-full flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 rounded transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Custom Model</span>
                      </button>
                    ) : (
                      <div className="p-1.5 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] rounded-lg space-y-1.5 text-xs animate-in fade-in duration-100">
                        <div className="flex items-center justify-between text-[10px] font-medium text-zinc-700 dark:text-zinc-300">
                          <span>New Model</span>
                          <button
                            type="button"
                            onClick={() => setIsAddingCustom(false)}
                            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. gemini-2.5-pro, local-llama"
                          value={newModelId}
                          onChange={(e) => setNewModelId(e.target.value)}
                          className="w-full bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded px-2 py-1 text-[11px] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none font-mono"
                        />
                        <div className="grid grid-cols-5 gap-0.5 text-[9px]">
                          {(["openai", "anthropic", "gemini", "deepseek", "custom"] as ProviderKey[]).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setNewModelProvider(p)}
                              className={`px-1 py-0.5 rounded text-center capitalize transition-colors ${
                                newModelProvider === p
                                  ? "bg-black/10 dark:bg-white/20 text-zinc-900 dark:text-white font-medium"
                                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                              }`}
                            >
                              {p === "custom" ? "local" : p}
                            </button>
                          ))}
                        </div>
                        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newModelReasoning}
                            onChange={(e) => setNewModelReasoning(e.target.checked)}
                            className="rounded border-black/20 dark:border-white/20 bg-transparent text-emerald-500 w-2.5 h-2.5"
                          />
                          <span>Reasoning support</span>
                        </label>
                        <button
                          type="button"
                          disabled={!newModelId.trim()}
                          onClick={() => {
                            if (!newModelId.trim()) return;
                            const customModel: ModelOption = {
                              id: newModelId.trim(),
                              name: newModelId.trim(),
                              provider: newModelProvider,
                              description: `Custom model via ${newModelProvider} API`,
                              supportsReasoning: newModelReasoning,
                              isCustom: true,
                            };
                            onAddCustomModel?.(customModel);
                            setNewModelId("");
                            setIsAddingCustom(false);
                            setIsModelDropdownOpen(false);
                          }}
                          className="w-full py-1 text-[11px] font-medium text-white bg-zinc-900 hover:bg-black dark:text-black dark:bg-zinc-100 dark:hover:bg-white disabled:opacity-40 rounded transition-colors"
                        >
                          Add Model
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Thinking / Reasoning Selector (Lighter & More Compact) */}
            {currentModel.supportsReasoning && (
              <div className="relative" ref={popoverRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsThinkingOpen(!isThinkingOpen);
                    setIsModelDropdownOpen(false);
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono transition-all duration-200 border group active:scale-95 ${
                    reasoningEnabled
                      ? "bg-black/[0.06] dark:bg-white/[0.08] border-black/[0.12] dark:border-white/[0.15] text-zinc-900 dark:text-zinc-100 font-medium"
                      : "bg-black/[0.03] dark:bg-white/[0.04] border-black/[0.06] dark:border-white/[0.06] text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                  title="Configure Reasoning Depth"
                >
                  <Brain
                    className={`w-3 h-3 transition-transform duration-200 ${
                      isPulsing
                        ? "animate-brain-active text-zinc-900 dark:text-zinc-100"
                        : reasoningEnabled
                        ? "text-zinc-800 dark:text-zinc-200"
                        : "text-zinc-400"
                    }`}
                  />
                  <span className="capitalize font-medium">
                    {reasoningEnabled ? `Thinking: ${reasoningEffort}` : "Thinking: Off"}
                  </span>

                  {/* Micro Synaptic Power Gauge */}
                  <div className="flex items-center gap-0.5 ml-0.5">
                    <span
                      className={`w-1 h-1 rounded-full transition-all duration-200 ${
                        reasoningEnabled
                          ? "bg-zinc-800 dark:bg-zinc-200"
                          : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    />
                    <span
                      className={`w-1 h-1 rounded-full transition-all duration-200 ${
                        reasoningEnabled && (reasoningEffort === "medium" || reasoningEffort === "high")
                          ? "bg-zinc-800 dark:bg-zinc-200"
                          : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    />
                    <span
                      className={`w-1 h-1 rounded-full transition-all duration-200 ${
                        reasoningEnabled && reasoningEffort === "high"
                          ? "bg-zinc-800 dark:bg-zinc-200"
                          : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    />
                  </div>

                  <ChevronDown
                    className={`w-2.5 h-2.5 opacity-60 ml-0.5 transition-transform duration-200 ${
                      isThinkingOpen ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </button>

                {/* Sleek, Compact Reasoning Popover (Hafif Küçültüldü) */}
                {isThinkingOpen && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute bottom-full mb-2 left-0 w-60 p-1.5 rounded-xl bg-white dark:bg-[#18181b] border border-black/10 dark:border-white/15 shadow-2xl z-50 animate-thinking-in text-xs select-none backdrop-blur-xl"
                  >
                    {/* Header */}
                    <div className="px-2 py-1 border-b border-black/[0.06] dark:border-white/[0.06] mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                        <Sparkles className="w-2.5 h-2.5 text-zinc-500" />
                        <span>Reasoning Depth</span>
                      </div>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400 lowercase">
                        {currentModel.provider === "gemini" ? "Gemini 3.x" : "effort"}
                      </span>
                    </div>

                    {/* Staggered Options List (Sleek Compact Size) */}
                    <div className="space-y-0.5">
                      {[
                        {
                          level: "off" as const,
                          label: "Off",
                          badge: null,
                          desc: "Immediate, zero latency",
                          dots: 0,
                        },
                        {
                          level: "low" as const,
                          label: "Low",
                          badge: null,
                          desc: "Fast reasoning for simple scripts",
                          dots: 1,
                        },
                        {
                          level: "medium" as const,
                          label: "Medium",
                          badge: "default",
                          desc: "Balanced code & architecture",
                          dots: 2,
                        },
                        {
                          level: "high" as const,
                          label: "High",
                          badge: "deep",
                          desc: "Deep multi-step reasoning",
                          dots: 3,
                        },
                      ].map((item, index) => {
                        const isSelected =
                          item.level === "off"
                            ? !reasoningEnabled
                            : reasoningEnabled && reasoningEffort === item.level;

                        const isClickEffect = selectedEffectId === item.level;

                        return (
                          <button
                            key={item.level}
                            type="button"
                            style={{ animationDelay: `${index * 30}ms` }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSelectLevel(item.level);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-all duration-150 cursor-pointer animate-item-stagger relative overflow-hidden group ${
                              isClickEffect
                                ? "scale-95 bg-black/[0.08] dark:bg-white/[0.1] ring-1 ring-black/10 dark:ring-white/15"
                                : isSelected
                                ? "bg-black/[0.05] dark:bg-white/[0.08] text-zinc-950 dark:text-zinc-100 font-medium border border-black/[0.08] dark:border-white/[0.1]"
                                : "text-zinc-700 dark:text-zinc-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {/* Visual Synaptic Level Gauge */}
                              <div className="pt-1 flex flex-col gap-0.5 items-center">
                                <span
                                  className={`w-1 h-1 rounded-full transition-all duration-200 ${
                                    item.dots >= 1
                                      ? "bg-zinc-800 dark:bg-zinc-200"
                                      : "bg-zinc-300 dark:bg-zinc-700"
                                  }`}
                                />
                                <span
                                  className={`w-1 h-1 rounded-full transition-all duration-200 ${
                                    item.dots >= 2
                                      ? "bg-zinc-800 dark:bg-zinc-200"
                                      : "bg-zinc-300 dark:bg-zinc-700"
                                  }`}
                                />
                                <span
                                  className={`w-1 h-1 rounded-full transition-all duration-200 ${
                                    item.dots >= 3
                                      ? "bg-zinc-800 dark:bg-zinc-200"
                                      : "bg-zinc-300 dark:bg-zinc-700"
                                  }`}
                                />
                              </div>

                              <div>
                                <div className="text-[11px] flex items-center gap-1.5">
                                  <span className="font-semibold tracking-tight">{item.label}</span>
                                  {item.badge && (
                                    <span className="text-[8px] px-1 py-0.2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400 font-mono">
                                      {item.badge}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-sans leading-tight mt-0.5">
                                  {item.desc}
                                </div>
                              </div>
                            </div>

                            {/* Checkmark */}
                            {isSelected && (
                              <div className="w-4 h-4 rounded-full bg-black/[0.06] dark:bg-white/[0.1] flex items-center justify-center shrink-0 ml-1.5 animate-in zoom-in-50 duration-150">
                                <Check className="w-2.5 h-2.5 text-zinc-800 dark:text-zinc-200 stroke-[2.5]" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action button & hint */}
          <div className="flex items-center gap-1.5">
            {queuedCount !== undefined && queuedCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                {queuedCount} queued
              </span>
            )}

            {isStreaming ? (
              input.trim() ? (
                <div className="flex items-center gap-1.5">
                  {onSteer && (
                    <button
                      type="button"
                      onClick={() => {
                        onSteer(input);
                        setInput("");
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-sm transition-all active:scale-95"
                      title="Steer: Inject guidance into active agent loop without cancelling background work (Enter)"
                    >
                      <Zap className="w-3 h-3 fill-current" />
                      <span>Steer</span>
                    </button>
                  )}
                  {onQueue && (
                    <button
                      type="button"
                      onClick={() => {
                        onQueue(input);
                        setInput("");
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-black/[0.06] hover:bg-black/[0.1] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] text-zinc-800 dark:text-zinc-200 transition-all active:scale-95"
                      title="Queue: Run this message sequentially after current agent step completes"
                    >
                      <ListOrdered className="w-3 h-3" />
                      <span className="hidden sm:inline">Queue</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onStop}
                    className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors ml-1"
                    title="Stop AI completely"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 mr-1">
                    <Loader2 className="w-3 h-3 animate-spin text-zinc-500 dark:text-zinc-400" />
                    <span className="hidden sm:inline">Working...</span>
                  </div>
                  <button
                    type="button"
                    onClick={onStop}
                    className="w-7 h-7 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 flex items-center justify-center transition-colors shadow-sm active:scale-95"
                    title="Stop generation"
                  >
                    <Square className="w-3 h-3 fill-current" />
                  </button>
                </div>
              )
            ) : (
              <>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 hidden sm:inline-flex items-center gap-0.5">
                  <span>Return</span>
                  <CornerDownLeft className="w-2.5 h-2.5" />
                </span>

                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!input.trim()}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all apple-tap ${
                    input.trim()
                      ? "bg-zinc-900 text-white hover:bg-black dark:bg-zinc-100 dark:text-black dark:hover:bg-white active:scale-90 shadow-sm"
                      : "bg-black/[0.04] text-zinc-400 dark:bg-white/[0.05] dark:text-zinc-600 cursor-not-allowed"
                  }`}
                  title="Send message"
                >
                  <ArrowUp className="w-3.5 h-3.5 stroke-[2.5] transition-transform active:-translate-y-0.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
