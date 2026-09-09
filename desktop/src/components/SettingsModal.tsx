import { useState, useEffect, type FC } from "react";
import {
  X,
  Sliders,
  ShieldCheck,
  Check,
  AlertCircle,
  Sparkles,
  Lock,
  Shield,
  Terminal,
  Globe,
  GitBranch,
  Database,
  Network,
  CopyCheck,
  ShieldAlert,
  Key,
  Cpu,
  Eye,
  EyeOff,
  Sun,
  Moon,
  CheckCircle2,
  Zap,
  Trash2,
  Plus,
  Link,
} from "lucide-react";
import { AppSettings, SecurityLevel, DEFAULT_PLUGINS, TokenUsage, MCPServerConfig } from "../types";
import {
  CURATED_GEMINI_MODELS,
} from "../services/geminiApi";
import { testMcpServerLink } from "../services/mcpClient";
import logoDark from "../assets/logo-dark.png";
import logoLight from "../assets/logo-light.png";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  usage?: TokenUsage;
  onResetUsage?: () => void;
}

type SettingsTab = "models" | "security" | "usage" | "plugins" | "general";

/**
 * Apple/Dieter Rams Minimalist Toggle Switch
 * Strictly monochrome, no garish neon colors.
 */
const ToggleSwitch: FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`w-9 h-5 rounded-full transition-colors duration-200 relative p-0.5 shrink-0 focus:outline-none ${
      checked
        ? "bg-zinc-900 dark:bg-zinc-100"
        : "bg-black/[0.12] dark:bg-white/[0.12]"
    } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
  >
    <div
      className={`w-4 h-4 rounded-full bg-white dark:bg-zinc-950 shadow-xs transition-transform duration-200 ${
        checked ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
);

/**
 * High-Craft Masked API Key Input
 */
const MaskedKeyInput: FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative flex items-center">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.08] focus:border-black/[0.22] dark:focus:border-white/[0.22] rounded-lg pl-3 pr-9 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 font-mono text-xs transition-colors outline-none"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-1"
        title={show ? "Hide key" : "Reveal key"}
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};

export const SettingsModal: FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  usage,
  onResetUsage,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>("models");

  // Custom MCP Server Form State
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpTransport, setNewMcpTransport] = useState<"sse" | "stdio">("sse");
  const [newMcpUrl, setNewMcpUrl] = useState("");
  const [newMcpCommand, setNewMcpCommand] = useState("");
  const [newMcpError, setNewMcpError] = useState<string | null>(null);
  const [isTestingMcp, setIsTestingMcp] = useState(false);
  const [mcpTestStatus, setMcpTestStatus] = useState<{ success: boolean; message: string; toolsCount?: number } | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Handle keyboard shortcuts (Esc to close, Cmd/Ctrl+Enter to save)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        onSaveSettings(localSettings);
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, localSettings, onClose, onSaveSettings]);

  if (!isOpen) return null;

  const handleTestMcp = async () => {
    if (newMcpTransport === "sse") {
      if (!newMcpUrl.trim()) {
        setNewMcpError("Please enter an MCP URL link first.");
        return;
      }
      setIsTestingMcp(true);
      setMcpTestStatus(null);
      setNewMcpError(null);
      const res = await testMcpServerLink(newMcpUrl.trim());
      setIsTestingMcp(false);
      setMcpTestStatus(res);
    }
  };

  const handleAddMcpServer = () => {
    if (!newMcpName.trim()) {
      setNewMcpError("Server name is required.");
      return;
    }
    if (newMcpTransport === "sse") {
      if (!newMcpUrl.trim()) {
        setNewMcpError("Server endpoint URL is required.");
        return;
      }
      try {
        new URL(newMcpUrl.trim());
      } catch {
        setNewMcpError("Please enter a valid HTTP/HTTPS URL (e.g. http://localhost:8000/sse)");
        return;
      }
    } else {
      if (!newMcpCommand.trim()) {
        setNewMcpError("Executable command is required.");
        return;
      }
    }

    const newServer: MCPServerConfig = {
      id: `custom-mcp-${Date.now()}`,
      name: newMcpName.trim(),
      transport: newMcpTransport,
      enabled: true,
      ...(newMcpTransport === "sse"
        ? { url: newMcpUrl.trim(), toolsCount: mcpTestStatus?.toolsCount || 1 }
        : {
            command: newMcpCommand.trim().split(" ")[0],
            args: newMcpCommand.trim().split(" ").slice(1),
            toolsCount: 1,
          }),
    };

    setLocalSettings((prev) => ({
      ...prev,
      mcpServers: [...(prev.mcpServers || []), newServer],
    }));

    setNewMcpName("");
    setNewMcpUrl("");
    setNewMcpCommand("");
    setNewMcpError(null);
    setMcpTestStatus(null);
    setShowAddMcp(false);
  };

  const handleDeleteMcpServer = (id: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      mcpServers: (prev.mcpServers || []).filter((s) => s.id !== id),
    }));
  };

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150 select-none">
      {/* Native Desktop Preferences Window (Linear / Raycast / Xcode standard) */}
      <div className="w-[840px] max-w-[95vw] h-[580px] max-h-[92vh] bg-surface rounded-2xl border border-black/[0.08] dark:border-white/[0.08] shadow-elevated overflow-hidden flex flex-col md:flex-row text-zinc-900 dark:text-zinc-100 animate-modal-sheet">
        {/* Left Master Navigation Sidebar */}
        <aside className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.01] p-3 flex flex-col justify-between">
          <div>
            {/* Window Branding */}
            <div className="flex items-center gap-2 px-3 py-2 mb-2">
              <div className="w-5 h-5 flex items-center justify-center shrink-0 select-none">
                <img
                  src={localSettings.theme === "light" ? logoLight : logoDark}
                  alt="Conductor Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 tracking-tight">
                Preferences
              </span>
            </div>

            {/* Navigation Tabs */}
            <nav className="space-y-1">
              {[
                {
                  id: "models" as SettingsTab,
                  label: "Models & Keys",
                  icon: Key,
                },
                {
                  id: "security" as SettingsTab,
                  label: "Execution & Safety",
                  icon: ShieldCheck,
                },
                {
                  id: "usage" as SettingsTab,
                  label: "Token Usage & Cost",
                  icon: Zap,
                  badge: usage ? `$${(usage.costUSD || 0).toFixed(4)}` : undefined,
                },
                {
                  id: "plugins" as SettingsTab,
                  label: "Plugins & MCP",
                  icon: Cpu,
                  badge: `${(localSettings.plugins || []).filter((p) => p.enabled).length} active`,
                },
                {
                  id: "general" as SettingsTab,
                  label: "Interface & System",
                  icon: Sliders,
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 text-left apple-tap-sm hover:translate-x-0.5 ${
                      isActive
                        ? "bg-surface-elevated text-zinc-950 dark:text-zinc-100 shadow-subtle border border-black/[0.06] dark:border-white/[0.08]"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}`} />
                      <span className="truncate">{tab.label}</span>
                    </div>
                    {tab.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Sovereignty Badge */}
          <div className="hidden md:block px-3 py-2 border-t border-black/[0.04] dark:border-white/[0.04] text-[10px] font-mono text-zinc-500 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
              <span>Sovereign Storage</span>
            </div>
            <div>Zero telemetry · 100% Local</div>
          </div>
        </aside>

        {/* Right Detail Panel */}
        <main className="flex-1 flex flex-col min-w-0 bg-surface dark:bg-[#0d0d10]">
          {/* Panel Top Header */}
          <div className="h-14 px-6 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between shrink-0 bg-black/[0.01] dark:bg-white/[0.01]">
            <div>
              <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {activeTab === "models" && "AI Providers & Inference Keys"}
                {activeTab === "security" && "PC Access & Execution Sandbox"}
                {activeTab === "usage" && "Session Token Usage & API Spend"}
                {activeTab === "plugins" && "Built-in Plugins & Model Context Protocol"}
                {activeTab === "general" && "Interface, Theme & Defaults"}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {activeTab === "models" && "Configure API credentials, model selectors, and output token limits."}
                {activeTab === "security" && "Define autonomous file write boundaries and dry-run protection."}
                {activeTab === "usage" && "Inspect real-time token metrics, reasoning expenditure, and raw provider costs."}
                {activeTab === "plugins" && "Enable sovereign devtools and local MCP servers."}
                {activeTab === "general" && "Customize visual appearance and project workspace behaviors."}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              title="Close preferences (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Panel Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
            {/* ========================================================= */}
            {/* TAB 1: MODELS & PROVIDERS                                */}
            {/* ========================================================= */}
            {activeTab === "models" && (
              <div className="space-y-5 animate-tab-content">
                {/* Security Guarantee Card */}
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] text-zinc-600 dark:text-zinc-400 text-[11px]">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    API keys are stored strictly on your local device. Conductor connects directly to providers with zero proxy servers.
                  </span>
                </div>

                {/* Google Gemini Card */}
                <div className="p-4 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                      <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                        Google Gemini API
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-zinc-500 text-[11px] block mb-1">API Key</span>
                    <MaskedKeyInput
                      value={localSettings.geminiKey}
                      onChange={(val) =>
                        setLocalSettings({ ...localSettings, geminiKey: val })
                      }
                      placeholder="AIzaSy..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-zinc-500 text-[11px] block mb-1">Selected Gemini Model</span>
                      <select
                        value={localSettings.geminiModel || "gemini-3.8-flash"}
                        onChange={(e) =>
                          setLocalSettings({ ...localSettings, geminiModel: e.target.value })
                        }
                        className="w-full bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-2.5 py-1.5 text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-xs font-mono"
                      >
                        {CURATED_GEMINI_MODELS.map((m) => (
                          <option key={m.id} value={m.id} className="bg-surface text-zinc-900 dark:text-zinc-100">
                            {m.id} {m.displayName && m.displayName !== m.id ? `(${m.displayName})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="text-zinc-500 text-[11px] block mb-1">Reasoning Engine</span>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1.5">
                        Native extended thinking & 1M context window supported out of the box.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grid: OpenAI & Anthropic */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* OpenAI Card */}
                  <div className="p-4 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                        OpenAI
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">Direct API</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[11px] block mb-1">API Key</span>
                      <MaskedKeyInput
                        value={localSettings.openaiKey}
                        onChange={(val) =>
                          setLocalSettings({ ...localSettings, openaiKey: val })
                        }
                        placeholder="sk-..."
                      />
                    </div>
                  </div>

                  {/* Anthropic Card */}
                  <div className="p-4 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                        Anthropic Claude
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">Direct API</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[11px] block mb-1">API Key</span>
                      <MaskedKeyInput
                        value={localSettings.anthropicKey}
                        onChange={(val) =>
                          setLocalSettings({ ...localSettings, anthropicKey: val })
                        }
                        placeholder="sk-ant-..."
                      />
                    </div>
                  </div>
                </div>

                {/* Grid: DeepSeek & Local/Ollama */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* DeepSeek */}
                  <div className="p-4 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                        DeepSeek
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">Direct API</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[11px] block mb-1">API Key</span>
                      <MaskedKeyInput
                        value={localSettings.deepseekKey}
                        onChange={(val) =>
                          setLocalSettings({ ...localSettings, deepseekKey: val })
                        }
                        placeholder="sk-..."
                      />
                    </div>
                  </div>

                  {/* Local / Ollama / LM Studio */}
                  <div className="p-4 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                        Local / Ollama / LM Studio
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">OpenAI-Compatible</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[11px] block mb-1">Base URL</span>
                      <input
                        type="text"
                        value={localSettings.customBaseURL}
                        onChange={(e) =>
                          setLocalSettings({ ...localSettings, customBaseURL: e.target.value })
                        }
                        placeholder="http://localhost:11434/v1"
                        className="w-full bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-mono text-xs outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Output Token Generation Ceilings */}
                <div className="p-4 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                        Max Generation Limit (Output Tokens)
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Upper threshold of tokens the model is permitted to generate per response.
                      </div>
                    </div>
                    <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100 font-semibold px-2 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08]">
                      {(localSettings.maxTokens || 65536).toLocaleString()} tokens
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {[16384, 32768, 65536].map((tokens) => {
                      const isSelected = (localSettings.maxTokens || 65536) === tokens;
                      return (
                        <button
                          key={tokens}
                          type="button"
                          onClick={() => setLocalSettings({ ...localSettings, maxTokens: tokens })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                            isSelected
                              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold border-transparent shadow-xs"
                              : "bg-black/[0.02] dark:bg-white/[0.03] border-black/[0.06] dark:border-white/[0.06] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                          }`}
                        >
                          {tokens >= 1000 ? `${tokens / 1024}K` : tokens}
                          {tokens === 65536 && " (Recommended)"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAB 2: EXECUTION & SECURITY                              */}
            {/* ========================================================= */}
            {activeTab === "security" && (
              <div className="space-y-5 animate-tab-content">
                {/* Security Level Selector (Cards) */}
                <div>
                  <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 mb-1">
                    Autonomous PC Access Level
                  </div>
                  <p className="text-[11px] text-zinc-500 mb-3">
                    Choose how freely Conductor can write code files and execute terminal operations.
                  </p>

                  <div className="space-y-2">
                    {[
                      {
                        id: "strict" as SecurityLevel,
                        title: "Strict (Prompt for Everything)",
                        desc: "Explicit manual review required before modifying any file or launching any command.",
                        icon: Lock,
                        badge: "High Guardrail",
                      },
                      {
                        id: "sandbox" as SecurityLevel,
                        title: "Sandbox (Balanced & Recommended)",
                        desc: "Auto-approves writes strictly inside the project folder, but prompts before executing bash/terminal commands.",
                        icon: Shield,
                        badge: "Recommended",
                      },
                      {
                        id: "full_access" as SecurityLevel,
                        title: "Full Access (Autonomous Loop)",
                        desc: "Full autonomy for modifying workspace code and running test commands without interruptions.",
                        icon: Terminal,
                        badge: "Autonomous",
                      },
                    ].map((level) => {
                      const isSelected = (localSettings.securityLevel || "sandbox") === level.id;
                      const Icon = level.icon;

                      return (
                        <div
                          key={level.id}
                          onClick={() => setLocalSettings({ ...localSettings, securityLevel: level.id })}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between ${
                            isSelected
                              ? "bg-zinc-900/[0.04] dark:bg-white/[0.06] border-zinc-900/30 dark:border-white/30 text-zinc-950 dark:text-zinc-100 shadow-xs"
                              : "bg-surface-elevated/40 border-black/[0.06] dark:border-white/[0.06] text-zinc-700 dark:text-zinc-300 hover:border-black/[0.15] dark:hover:border-white/[0.15]"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-1.5 rounded-lg ${isSelected ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950" : "bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500"}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-semibold text-xs flex items-center gap-2">
                                <span>{level.title}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500">
                                  {level.badge}
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                                {level.desc}
                              </div>
                            </div>
                          </div>

                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-1 ${isSelected ? "border-zinc-900 dark:border-white" : "border-zinc-400 dark:border-zinc-600"}`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-white" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Anti-Bloat Complexity Governor */}
                <div className="p-4 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      <span>Anti-Bloat Complexity Governor</span>
                      <span className="text-[10px] font-mono text-zinc-400">Dieter Rams Standard</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-lg">
                      Audits proposed AI code diffs: enforces minimal lines of code (LOC) and prevents redundant npm dependencies when zero-overhead browser primitives exist.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(localSettings.antiBloatEnabled)}
                    onChange={(checked) =>
                      setLocalSettings({ ...localSettings, antiBloatEnabled: checked })
                    }
                  />
                </div>

                {/* Browser Dry-Run Pre-Flight Interception */}
                <div className="p-4 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                      <ShieldAlert className="w-4 h-4 text-blue-500" />
                      <span>Dry-Run Pre-Flight (Browser Sandbox)</span>
                      <span className="text-[10px] font-mono text-zinc-400">CDP Interception</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-lg">
                      Intercepts state-altering network requests (POST/PUT/DELETE, checkout forms, account deletes) during browser automation and requires manual confirmation before dispatching.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(localSettings.browserDryRunEnabled)}
                    onChange={(checked) =>
                      setLocalSettings({ ...localSettings, browserDryRunEnabled: checked })
                    }
                  />
                </div>

                {/* Auto-Apply Code Diffs in Workspace */}
                <div className="p-4 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      <span>Auto-Apply Code Diffs</span>
                      <span className="text-[10px] font-mono text-zinc-400">Autonomous Writes</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-lg">
                      Automatically approve and apply file changes proposed by the AI inside the active workspace without prompting for manual confirmation.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(localSettings.autoApproveWrites)}
                    onChange={(checked) =>
                      setLocalSettings({ ...localSettings, autoApproveWrites: checked })
                    }
                  />
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAB: TOKEN USAGE & COST                                  */}
            {/* ========================================================= */}
            {activeTab === "usage" && (
              <div className="space-y-5 animate-tab-content">
                {/* Hero Cost Spend Card */}
                <div className="p-5 rounded-2xl bg-surface-elevated/50 border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                      Total Session Spend
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight">
                        ${(usage?.costUSD || 0).toFixed(4)}
                      </span>
                      <span className="text-xs text-zinc-500 font-mono">USD</span>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Billed directly by your configured model providers with 0% Conductor markup.
                    </p>
                  </div>

                  {onResetUsage && (
                    <button
                      type="button"
                      onClick={onResetUsage}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 border border-black/[0.08] dark:border-white/[0.08] hover:border-rose-500/30 hover:bg-rose-500/10 transition-colors"
                      title="Reset current session token counter to $0.00"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Reset Meter</span>
                    </button>
                  )}
                </div>

                {/* 4-Stat Metric Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-surface-elevated/40 border border-black/[0.06] dark:border-white/[0.06] space-y-1">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">Input Tokens</span>
                    <div className="text-base font-semibold font-mono text-zinc-900 dark:text-zinc-100">
                      {(usage?.inputTokens || usage?.promptTokens || 0).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-zinc-500">Prompts & Context</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-elevated/40 border border-black/[0.06] dark:border-white/[0.06] space-y-1">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">Output Tokens</span>
                    <div className="text-base font-semibold font-mono text-zinc-900 dark:text-zinc-100">
                      {(usage?.outputTokens || usage?.completionTokens || 0).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-zinc-500">Generated Code</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-elevated/40 border border-black/[0.06] dark:border-white/[0.06] space-y-1">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">Thinking</span>
                    <div className="text-base font-semibold font-mono text-zinc-900 dark:text-zinc-100">
                      {(usage?.reasoningTokens || 0).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-zinc-500">Extended Reasoning</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-elevated/40 border border-black/[0.06] dark:border-white/[0.06] space-y-1">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">Total Tokens</span>
                    <div className="text-base font-semibold font-mono text-zinc-900 dark:text-zinc-100">
                      {(
                        usage?.totalTokens ||
                        (usage?.inputTokens || usage?.promptTokens || 0) +
                          (usage?.outputTokens || usage?.completionTokens || 0)
                      ).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-zinc-500">Cumulative Load</span>
                  </div>
                </div>

                {/* Direct Provider Advantage Card */}
                <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span>Direct-to-Provider Cost Advantage</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 max-w-md">
                      Unlike cloud subscription platforms ($20/mo), Conductor connects straight to provider endpoints so you pay cents per million tokens.
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      ~95% Savings
                    </div>
                    <div className="text-[10px] text-zinc-400">vs Fixed Subscriptions</div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAB 3: PLUGINS & MCP                                     */}
            {/* ========================================================= */}
            {activeTab === "plugins" && (
              <div className="space-y-5 animate-tab-content">
                <div>
                  <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 mb-1">
                    Sovereign Built-in Plugins
                  </div>
                  <p className="text-[11px] text-zinc-500 mb-3">
                    Toggle capabilities exposed directly to the autonomous agent harness.
                  </p>

                  <div className="space-y-2">
                    {(localSettings.plugins || DEFAULT_PLUGINS).map((plugin) => (
                      <div
                        key={plugin.id}
                        className="p-3.5 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0">
                            {plugin.category === "git" && <GitBranch className="w-4 h-4" />}
                            {plugin.category === "database" && <Database className="w-4 h-4" />}
                            {plugin.category === "browser" && <Globe className="w-4 h-4" />}
                            {plugin.id === "ghost-twin" && <CopyCheck className="w-4 h-4" />}
                            {plugin.id === "traffic-synthesizer" && <Network className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                              {plugin.name}
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate max-w-md">
                              {plugin.description}
                            </div>
                          </div>
                        </div>

                        <ToggleSwitch
                          checked={plugin.enabled}
                          onChange={(checked) => {
                            const updated = (localSettings.plugins || DEFAULT_PLUGINS).map((p) =>
                              p.id === plugin.id ? { ...p, enabled: checked } : p
                            );
                            setLocalSettings({ ...localSettings, plugins: updated });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Model Context Protocol (MCP) Servers */}
                <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <span>Model Context Protocol (MCP)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500">
                          JSON-RPC v1.0
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Connect external tool servers via HTTP / SSE link or local command.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMcp(!showAddMcp);
                        setNewMcpError(null);
                        setMcpTestStatus(null);
                      }}
                      className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.06] dark:hover:bg-white/[0.06] text-zinc-800 dark:text-zinc-200 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showAddMcp ? "Cancel" : "Add MCP Server"}</span>
                    </button>
                  </div>

                  {/* Add MCP Form */}
                  {showAddMcp && (
                    <div className="p-4 mb-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.08] dark:border-white/[0.08] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          Add Custom MCP Server
                        </span>
                        {/* Transport switcher */}
                        <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-lg text-[11px] font-mono">
                          <button
                            type="button"
                            onClick={() => {
                              setNewMcpTransport("sse");
                              setNewMcpError(null);
                              setMcpTestStatus(null);
                            }}
                            className={`px-2.5 py-0.5 rounded-md transition-colors ${
                              newMcpTransport === "sse"
                                ? "bg-surface text-zinc-900 dark:text-zinc-100 shadow-sm"
                                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                            }`}
                          >
                            Link (HTTP / SSE)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewMcpTransport("stdio");
                              setNewMcpError(null);
                              setMcpTestStatus(null);
                            }}
                            className={`px-2.5 py-0.5 rounded-md transition-colors ${
                              newMcpTransport === "stdio"
                                ? "bg-surface text-zinc-900 dark:text-zinc-100 shadow-sm"
                                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                            }`}
                          >
                            Command (stdio)
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <div>
                          <label className="text-zinc-500 text-[11px] block mb-1">Server Name</label>
                          <input
                            type="text"
                            value={newMcpName}
                            onChange={(e) => setNewMcpName(e.target.value)}
                            placeholder="e.g. Remote Knowledge, Postgres MCP"
                            className="w-full bg-surface border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
                          />
                        </div>

                        {newMcpTransport === "sse" ? (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-zinc-500 text-[11px]">MCP Endpoint Link (URL)</label>
                              <button
                                type="button"
                                onClick={handleTestMcp}
                                disabled={isTestingMcp || !newMcpUrl.trim()}
                                className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-40 transition-colors"
                              >
                                {isTestingMcp ? "Testing..." : "Test Connection"}
                              </button>
                            </div>
                            <div className="relative">
                              <input
                                type="text"
                                value={newMcpUrl}
                                onChange={(e) => setNewMcpUrl(e.target.value)}
                                placeholder="http://localhost:8000/sse or https://api.example.com/mcp"
                                className="w-full bg-surface border border-black/[0.08] dark:border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
                              />
                              <Link className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5 pointer-events-none" />
                            </div>
                            <span className="text-[10px] text-zinc-400 mt-1 block">
                              Supports standard MCP JSON-RPC 2.0 over HTTP / Server-Sent Events.
                            </span>
                          </div>
                        ) : (
                          <div>
                            <label className="text-zinc-500 text-[11px] block mb-1">Executable Command</label>
                            <input
                              type="text"
                              value={newMcpCommand}
                              onChange={(e) => setNewMcpCommand(e.target.value)}
                              placeholder="npx -y @modelcontextprotocol/server-postgres postgresql://..."
                              className="w-full bg-surface border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
                            />
                          </div>
                        )}

                        {mcpTestStatus && (
                          <div
                            className={`text-[11px] font-mono flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                              mcpTestStatus.success
                                ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                : "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
                            }`}
                          >
                            {mcpTestStatus.success ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                            <span>{mcpTestStatus.message}</span>
                          </div>
                        )}

                        {newMcpError && (
                          <div className="text-[11px] text-rose-500 flex items-center gap-1.5 pt-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{newMcpError}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddMcp(false);
                              setNewMcpError(null);
                              setMcpTestStatus(null);
                            }}
                            className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleAddMcpServer}
                            className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 transition-colors"
                          >
                            Add Server
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* List of MCP Servers */}
                  <div className="space-y-2">
                    {(localSettings.mcpServers || []).map((srv) => (
                      <div
                        key={srv.id}
                        className="p-3 rounded-xl bg-surface-elevated/40 border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {srv.name}
                            </div>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500 shrink-0">
                              {srv.transport === "sse" ? "HTTP / SSE" : "stdio"}
                            </span>
                          </div>
                          <div
                            className="text-[10px] font-mono text-zinc-500 truncate mt-0.5"
                            title={srv.url || `${srv.command || ""} ${(srv.args || []).join(" ")}`}
                          >
                            {srv.transport === "sse" ? (
                              <span className="flex items-center gap-1">
                                <Link className="w-2.5 h-2.5 shrink-0 text-zinc-400" />
                                <span className="truncate">{srv.url}</span>
                              </span>
                            ) : (
                              <span>
                                {srv.command} {(srv.args || []).join(" ")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <ToggleSwitch
                            checked={srv.enabled}
                            onChange={(checked) => {
                              const updated = (localSettings.mcpServers || []).map((s) =>
                                s.id === srv.id ? { ...s, enabled: checked } : s
                              );
                              setLocalSettings({ ...localSettings, mcpServers: updated });
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteMcpServer(srv.id)}
                            className="p-1.5 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                            title="Remove server"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(localSettings.mcpServers || []).length === 0 && (
                      <div className="text-center py-4 text-zinc-500 text-xs font-mono">
                        No MCP servers configured. Click &quot;Add MCP Server&quot; to connect a link or command.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAB 4: GENERAL & INTERFACE                               */}
            {/* ========================================================= */}
            {activeTab === "general" && (
              <div className="space-y-5 animate-tab-content">
                {/* Theme Mode Selector */}
                <div>
                  <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 mb-1">
                    Visual Theme
                  </div>
                  <p className="text-[11px] text-zinc-500 mb-3">
                    Select your preferred interface color system.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: "dark" as const, label: "Obsidian Dark", desc: "Matte #09090b canvas with low eye-strain zinc contrast", icon: Moon },
                      { id: "light" as const, label: "Crisp Light", desc: "Clean studio white with high-legibility typography", icon: Sun },
                    ].map((themeOpt) => {
                      const isSelected = (localSettings.theme || "dark") === themeOpt.id;
                      const Icon = themeOpt.icon;
                      return (
                        <div
                          key={themeOpt.id}
                          onClick={() => setLocalSettings({ ...localSettings, theme: themeOpt.id })}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            isSelected
                              ? "bg-zinc-900/[0.04] dark:bg-white/[0.06] border-zinc-900/30 dark:border-white/30 text-zinc-950 dark:text-zinc-100 shadow-xs"
                              : "bg-surface-elevated/40 border-black/[0.06] dark:border-white/[0.06] text-zinc-600 dark:text-zinc-400 hover:border-black/[0.15] dark:hover:border-white/[0.15]"
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${isSelected ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950" : "bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500"}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                              {themeOpt.label}
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                              {themeOpt.desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Telemetry and Local Sovereignty Guarantee */}
                <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] space-y-1.5">
                  <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Sovereign Local Execution</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    LLM Conductor does not track you, does not log prompts to central telemetry servers, and never phones home. All file operations, command runs, and API tokens remain sovereign on your device.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Panel Bottom Footer */}
          <div className="h-14 px-6 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between shrink-0 bg-black/[0.02] dark:bg-black/20">
            <div className="text-[11px] text-zinc-400 font-mono hidden sm:block">
              Press <kbd className="px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.08]">Esc</kbd> to exit · <kbd className="px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.08]">Ctrl+Enter</kbd> to save
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all text-xs font-medium apple-tap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 font-medium text-xs transition-all shadow-sm apple-tap active:scale-95"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
