import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Conductor } from "llm-conductor";
import {
  ChatMessage,
  AppSettings,
  DEFAULT_SETTINGS,
  AVAILABLE_MODELS,
  ModelOption,
  WorkspaceFile,
  ToolCallRecord,
  FileDiff,
  ChatSession,
  TokenUsage,
} from "./types";
import { TitleBar } from "./components/TitleBar";
import { MessageItem } from "./components/MessageItem";
import { PromptBar } from "./components/PromptBar";
import { SettingsModal } from "./components/SettingsModal";
import { ExportCodeModal } from "./components/ExportCodeModal";
import { WorkspaceDrawer } from "./components/WorkspaceDrawer";
import { BrowserPreviewPanel } from "./components/BrowserPreviewPanel";
import {
  pickProjectFolder,
  listProjectFiles,
  readFileContent,
  writeFileContent,
  runProjectCommand,
  openExternalUrl,
} from "./services/tauriFs";
import { getActiveMCPTools } from "./services/mcpClient";
import { inspectDiffComplexity } from "./services/complexityGovernor";
import { generateGhostTwinDataset } from "./services/ghostTwin";
import { synthesizeFromTraffic } from "./services/trafficSynthesizer";
import { fastBrowserEngine } from "./services/fastBrowser";
import { ArrowRight, FolderOpen } from "lucide-react";
import logoDark from "./assets/logo-dark.png";
import logoLight from "./assets/logo-light.png";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Image as TauriImage } from "@tauri-apps/api/image";

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem("conductor_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.maxTokens || parsed.maxTokens < 65536) {
          parsed.maxTokens = 65536;
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);

  // Chat session history state
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem("conductor_sessions");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("conductor_active_session_id") || null;
    } catch {
      return null;
    }
  });

  // Mid-flight steering & queuing refs
  const steeringQueueRef = useRef<string[]>([]);
  const messageQueueRef = useRef<string[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);

  // Workspace state
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Approval resolver registry for interactive file writes
  const pendingApprovalsRef = useRef<Map<string, (approved: boolean) => void>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("conductor_sessions", JSON.stringify(sessions));
    } catch (e) {
      console.warn("Failed to persist sessions:", e);
    }
  }, [sessions]);

  // Dynamically update OS Window & Taskbar icon to the new enso logo
  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      (async () => {
        try {
          const res = await fetch("/favicon.png");
          const buf = await res.arrayBuffer();
          const img = await TauriImage.fromBytes(buf);
          await getCurrentWindow().setIcon(img);
        } catch (e) {
          console.warn("Dynamic window icon update:", e);
        }
      })();
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("conductor_active_session_id", activeSessionId || "");
    } catch {}
  }, [activeSessionId]);

  // Sync active session when messages change
  useEffect(() => {
    if (messages.length === 0) return;

    if (activeSessionId) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages,
                updatedAt: Date.now(),
                workspacePath: s.workspacePath || settings.activeWorkspacePath || undefined,
              }
            : s
        )
      );
    } else {
      const firstUserMsg = messages.find((m) => m.role === "user");
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 32).trim()
        : "New Session";
      const newSession: ChatSession = {
        id: `session-${Date.now()}`,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages,
        workspacePath: settings.activeWorkspacePath || undefined,
      };
      setActiveSessionId(newSession.id);
      setSessions((prev) => [newSession, ...prev]);
    }
  }, [messages, activeSessionId, settings.activeWorkspacePath]);

  useEffect(() => {
    localStorage.setItem("conductor_settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Load workspace files if path is saved
  const refreshWorkspaceFiles = useCallback(async (rootPath?: string) => {
    const target = rootPath || settings.activeWorkspacePath;
    if (!target) {
      setWorkspaceFiles([]);
      return;
    }
    setIsLoadingFiles(true);
    try {
      const files = await listProjectFiles(target);
      setWorkspaceFiles(files);
    } catch (err) {
      console.warn("Failed to load workspace files:", err);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [settings.activeWorkspacePath]);

  useEffect(() => {
    if (settings.activeWorkspacePath) {
      refreshWorkspaceFiles(settings.activeWorkspacePath);
    }
  }, [settings.activeWorkspacePath, refreshWorkspaceFiles]);

  useEffect(() => {
    fastBrowserEngine.setDryRunEnabled(Boolean(settings.browserDryRunEnabled));
  }, [settings.browserDryRunEnabled]);

  const allModels = [...AVAILABLE_MODELS, ...(settings.customModels || [])];
  const currentModel =
    allModels.find((m) => m.id === settings.selectedModel) || allModels[0];

  useEffect(() => {
    if (settings.theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, [settings.theme]);

  useEffect(() => {
    if (!allModels.some((m) => m.id === settings.selectedModel)) {
      setSettings((prev) => ({ ...prev, selectedModel: allModels[0].id }));
    }
  }, [allModels, settings.selectedModel]);

  const handleToggleTheme = (event: React.MouseEvent<HTMLButtonElement>) => {
    const isCurrentlyDark = document.documentElement.classList.contains("dark");
    const nextTheme: "dark" | "light" = isCurrentlyDark ? "light" : "dark";

    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSettings((prev) => ({ ...prev, theme: nextTheme }));
      if (nextTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const right = window.innerWidth - x;
    const bottom = window.innerHeight - y;
    const maxRadius = Math.hypot(Math.max(x, right), Math.max(y, bottom));

    const transition = document.startViewTransition(() => {
      setSettings((prev) => ({ ...prev, theme: nextTheme }));
      if (nextTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    });

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${maxRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 520,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {});
  };

  const handleOpenProject = async () => {
    const selected = await pickProjectFolder();
    if (selected) {
      setSettings((prev) => ({ ...prev, activeWorkspacePath: selected }));
      setIsWorkspaceOpen(true);
      await refreshWorkspaceFiles(selected);
    }
  };

  const handleCloseProject = () => {
    setSettings((prev) => ({ ...prev, activeWorkspacePath: "" }));
    setWorkspaceFiles([]);
    setIsWorkspaceOpen(false);
  };

  const handleAddCustomModel = (model: ModelOption) => {
    const updated = [...(settings.customModels || []).filter((m) => m.id !== model.id), model];
    setSettings((prev) => ({
      ...prev,
      customModels: updated,
      selectedModel: model.id,
    }));
  };

  const handleRemoveCustomModel = (modelId: string) => {
    const updated = (settings.customModels || []).filter((m) => m.id !== modelId);
    setSettings((prev) => ({
      ...prev,
      customModels: updated,
      selectedModel: prev.selectedModel === modelId ? AVAILABLE_MODELS[0].id : prev.selectedModel,
    }));
  };

  const getApiKeyForModel = (provider: string): string => {
    switch (provider) {
      case "openai":
        return settings.openaiKey;
      case "anthropic":
        return settings.anthropicKey;
      case "gemini":
        return settings.geminiKey;
      case "deepseek":
        return settings.deepseekKey;
      case "custom":
        return settings.customApiKey || "ollama";
      default:
        return "";
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Reject any pending approval promises
    for (const resolver of pendingApprovalsRef.current.values()) {
      resolver(false);
    }
    pendingApprovalsRef.current.clear();
    setIsStreaming(false);
  };

  const handleClearHistory = () => {
    handleStop();
    setMessages([]);
    setActiveSessionId(null);
  };

  const handleSelectSession = (sessionId: string) => {
    const target = sessions.find((s) => s.id === sessionId);
    if (target) {
      handleStop();
      setActiveSessionId(target.id);
      setMessages(target.messages);
    }
  };

  const handleNewSession = () => {
    handleStop();
    setActiveSessionId(null);
    setMessages([]);
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const handleRenameSession = (sessionId: string, newTitle: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s))
    );
  };

  const sessionUsage: TokenUsage = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let reasoningTokens = 0;
    let costUSD = 0;
    for (const m of messages) {
      if (m.usage) {
        inputTokens += m.usage.inputTokens || m.usage.promptTokens || 0;
        outputTokens += m.usage.outputTokens || m.usage.completionTokens || 0;
        reasoningTokens += m.usage.reasoningTokens || 0;
        costUSD += m.usage.costUSD || 0;
      }
    }
    return {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      inputTokens,
      outputTokens,
      reasoningTokens,
      totalTokens: inputTokens + outputTokens + reasoningTokens,
      costUSD,
      latencyMs: 0,
    };
  }, [messages]);

  const handleSteer = (text: string) => {
    if (!text.trim()) return;
    if (!isStreaming) {
      handleSend(text);
      return;
    }

    const steerMessage: ChatMessage = {
      id: `steer-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
      steered: true,
    };

    setMessages((prev) => [...prev, steerMessage]);
    steeringQueueRef.current.push(text);
  };

  const handleQueue = (text: string) => {
    if (!text.trim()) return;
    messageQueueRef.current.push(text);
    setQueuedCount(messageQueueRef.current.length);
  };

  // Diff approval handlers
  const handleApproveDiff = (messageId: string, diffPath: string) => {
    const key = `${messageId}:${diffPath}`;
    const resolver = pendingApprovalsRef.current.get(key);
    if (resolver) {
      resolver(true);
      pendingApprovalsRef.current.delete(key);
    }
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              fileDiffs: msg.fileDiffs?.map((d) =>
                d.path === diffPath ? { ...d, approved: true } : d
              ),
            }
          : msg
      )
    );
  };

  const handleRejectDiff = (messageId: string, diffPath: string) => {
    const key = `${messageId}:${diffPath}`;
    const resolver = pendingApprovalsRef.current.get(key);
    if (resolver) {
      resolver(false);
      pendingApprovalsRef.current.delete(key);
    }
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              fileDiffs: msg.fileDiffs?.map((d) =>
                d.path === diffPath ? { ...d, approved: false } : d
              ),
            }
          : msg
      )
    );
  };

  // Autonomous coding tools schemas
  const workspaceTools = [
    {
      name: "list_files",
      description: "List files and directories in the project workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Subdirectory path, or empty string for root" },
        },
      },
    },
    {
      name: "read_file",
      description: "Read the UTF-8 text contents of a file in the workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path from workspace root, e.g. src/App.tsx" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Create or modify a file in the workspace. Automatically generates a visual diff for user review.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path from workspace root" },
          content: { type: "string", description: "Full file content to write" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "run_command",
      description: "Execute a shell command (powershell/bash) in the workspace root and return output.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run" },
        },
        required: ["command"],
      },
    },
    {
      name: "fast_browser_action",
      description:
        "Super-fast Chrome DevTools Protocol (CDP port 9222) controller with Ghost Cursor and Vision Snapshot. Capable of high-level intent macros (search_and_select, control_media, extract_readable_text, scroll) and granular DOM actions (navigate, click, type, screenshot, get_dom, evaluate).",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "search_and_select",
              "navigate",
              "control_media",
              "extract_readable_text",
              "get_network_data",
              "scroll",
              "click",
              "type",
              "screenshot",
              "get_dom",
              "evaluate",
            ],
            description:
              "Browser action: 'search_and_select' (RECOMMENDED: Searches YouTube/Google and opens the result in a single step with value='<query>' and index=0), 'navigate' (open URL), 'control_media' (play/pause/mute/fullscreen), 'extract_readable_text' (clean text markdown), 'get_network_data' (RAM reverse-scraping of backend JSON APIs), 'scroll' (up/down), 'click' (click element), 'type' (fill form/input), 'screenshot' (vision snapshot), 'get_dom' (interactive elements), 'evaluate' (run JS)",
          },
          target: {
            type: "string",
            description:
              "Target URL (for navigate), CSS selector/text (for click/type), or direction ('up'/'down' for scroll)",
          },
          value: {
            type: "string",
            description:
              "Search query (for search_and_select), text to type (for type), media action ('play'|'pause'|'mute'|'fullscreen' for control_media), or JS expression (for evaluate)",
          },
          index: {
            type: "number",
            description:
              "Optional 0-indexed result to click for search_and_select (e.g. 0 for first result)",
          },
        },
        required: ["action"],
      },
    },
    {
      name: "generate_ghost_twin",
      description: "Production Ghost Twin dataset generator. Creates differential-privacy synthetic records with realistic edge-cases (unicode, boundary numbers, SQL injection probes) without PII leakage.",
      parameters: {
        type: "object",
        properties: {
          schema: { type: "object", description: "Record schema definition mapping fields to types" },
          count: { type: "number", description: "Number of synthetic records to generate (default: 5)" },
        },
        required: ["schema"],
      },
    },
    {
      name: "synthesize_traffic",
      description: "Traffic-to-FullStack synthesis engine. Reverses recorded HTTP/API exchanges into strongly-typed TypeScript SDKs, Zod schemas, and offline mock handlers.",
      parameters: {
        type: "object",
        properties: {
          recordedExchanges: {
            type: "array",
            items: { type: "object" },
            description: "Array of recorded HTTP exchanges with method, endpoint, status, responseBody",
          },
        },
        required: ["recordedExchanges"],
      },
    },
  ];

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: textToSend,
      timestamp: Date.now(),
    };

    const assistantMessageId = `assistant-${Date.now()}`;
    const activeModelName =
      currentModel.provider === "gemini"
        ? (settings.geminiModel || "gemini-3.8-flash")
        : currentModel.provider === "openai"
        ? (settings.openaiModel || "gpt-4o")
        : currentModel.provider === "anthropic"
        ? (settings.anthropicModel || "claude-3-7-sonnet-20250219")
        : currentModel.name;

    const initialAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      model: activeModelName,
      provider: currentModel.provider,
      timestamp: Date.now(),
      toolCalls: [],
      fileDiffs: [],
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setInput("");
    setIsStreaming(true);

    const apiKey = getApiKeyForModel(currentModel.provider);

    // If no API key is provided, run the realistic Codex harness simulation
    if (!apiKey) {
      simulateCodexDemo(textToSend, assistantMessageId);
      return;
    }

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const providerParam =
        currentModel.provider === "deepseek"
          ? "openai"
          : currentModel.provider === "custom"
          ? "openai"
          : currentModel.provider;

      const baseURL =
        currentModel.provider === "deepseek"
          ? "https://api.deepseek.com/v1"
          : currentModel.provider === "custom"
          ? settings.customBaseURL
          : undefined;

      const modelParam = currentModel.isCustom
        ? currentModel.id
        : currentModel.provider === "gemini"
        ? (settings.geminiModel || "gemini-3.8-flash")
        : currentModel.provider === "openai"
        ? (settings.openaiModel || "gpt-4o")
        : currentModel.provider === "anthropic"
        ? (settings.anthropicModel || "claude-3-7-sonnet-20250219")
        : currentModel.provider === "deepseek"
        ? (settings.reasoningEnabled ? "deepseek-reasoner" : (settings.deepseekModel || "deepseek-chat"))
        : undefined;

      const conductor = new Conductor({
        provider: providerParam,
        apiKey,
        model: modelParam,
        baseURL,
        temperature: settings.temperature,
        maxTokens: Math.max(settings.maxTokens || 65536, 65536),
        timeoutMs: currentModel.provider === "custom" ? 600_000 : 300_000,
        reasoningEffort: settings.reasoningEnabled
          ? (settings.reasoningEffort || "medium")
          : "none",
      });

      // Load active MCP tools and preconfigured plugins
      const activeMcpTools = getActiveMCPTools(settings.plugins, settings.mcpServers);
      const mcpDefinitions = activeMcpTools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
      const combinedTools = [...workspaceTools, ...mcpDefinitions];

      conductor.system(
        `You are Conductor Codex, an autonomous, sovereign AI coding harness running locally on the user's computer.
${settings.activeWorkspacePath ? `Current workspace root: ${settings.activeWorkspacePath}` : "No workspace folder selected yet."}
Security Level: ${settings.securityLevel.toUpperCase()}
Anti-Bloat Governor: ${settings.antiBloatEnabled ? "Active (Strict Dieter Rams minimalism)" : "Disabled"}
IMPORTANT: You have direct native access to execute tools on the local machine:
- "fast_browser_action": Revolutionary Chrome controller (CDP port 9222) with Session Tethering, Network-First Reverse Scraping, Dry-Run Pre-Flight, and Co-Pilot Collision Avoidance.
  * SEARCHING YOUTUBE / GOOGLE / WEB: To search on YouTube, Google, or any website and open a video/result, ALWAYS make a SINGLE call: { action: "search_and_select", value: "<search query>", index: 0 }. DO NOT split this into multiple navigate/type/click calls!
  * To open any website directly: call fast_browser_action with { action: "navigate", target: "<url>" } (Chrome starts with user's cookies/session tethered, zero login needed).
  * To control media (play/pause/mute/fullscreen): call fast_browser_action with { action: "control_media", value: "play" | "pause" | "mute" | "fullscreen" }.
  * To capture backend JSON REST/GraphQL data directly from RAM without DOM scraping: call fast_browser_action with { action: "get_network_data", value: "<optional_endpoint_filter>" }.
  * To read article/page content cleanly without ads: call fast_browser_action with { action: "extract_readable_text" }.
  * To scroll: call fast_browser_action with { action: "scroll", target: "down" | "up" }.
  * To click or type: call fast_browser_action with { action: "click" | "type", target: "<selector_or_text>", value: "<text>" }.
  * To capture visual snapshot: call fast_browser_action with { action: "screenshot" }.
  Note: When user touches their physical mouse or keyboard, Ghost Cursor automatically dims and yields (Co-Pilot Collision Avoidance).
  When the user asks you to open a browser, search something, or control video/web pages, YOU MUST IMMEDIATELY CALL fast_browser_action! Never refuse by saying you cannot access the web; you have full native permissions.
- "list_files", "read_file", "write_file", "run_command": Workspace file editing and terminal commands.
Always call the appropriate tool directly. Respond concisely and helpfully in the user's language.`
      );
      conductor.withTools(combinedTools, "auto");

      // Populate conversation history
      for (const msg of [...messages, userMessage]) {
        if (msg.role === "user") conductor.user(msg.content);
        else if (msg.role === "assistant" && msg.content) conductor.assistant(msg.content);
      }

      // Autonomous Harness Agentic Loop
      let continueLoop = true;
      let round = 0;
      const MAX_ROUNDS = 6;
      let accumulatedReasoning = "";
      let accumulatedContent = "";
      const startTime = Date.now();

      while (continueLoop && round < MAX_ROUNDS) {
        round++;
        let lastResponse: any = null;

        // Mid-Flight Steering: If user sent guidance while streaming, inject into agent loop context
        if (steeringQueueRef.current.length > 0) {
          const steeredPrompts = steeringQueueRef.current.splice(0);
          for (const sp of steeredPrompts) {
            conductor.user(`[MID-FLIGHT USER GUIDANCE]: ${sp}`);
          }
        }

        for await (const chunk of conductor.stream({ signal: abortController.signal })) {
          if (chunk.type === "reasoning_delta") {
            accumulatedReasoning += chunk.delta;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      reasoning: accumulatedReasoning,
                      thinkingDurationMs: Date.now() - startTime,
                    }
                  : m
              )
            );
          } else if (chunk.type === "text_delta") {
            accumulatedContent += chunk.delta;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: accumulatedContent,
                    }
                  : m
              )
            );
          } else if (chunk.type === "done") {
            lastResponse = chunk.response;
            const respUsage = chunk.response?.usage as any;
            const inTok =
              respUsage?.inputTokens ||
              respUsage?.promptTokens ||
              Math.ceil(
                (textToSend.length + messages.reduce((acc, m) => acc + m.content.length, 0)) / 4
              );
            const outTok =
              respUsage?.outputTokens ||
              respUsage?.completionTokens ||
              Math.ceil((accumulatedContent.length + accumulatedReasoning.length) / 4);
            const rTok = Math.ceil(accumulatedReasoning.length / 4);
            const cost = inTok * 0.0000005 + outTok * 0.000002;
            const usageObj: TokenUsage = {
              promptTokens: inTok,
              completionTokens: outTok,
              inputTokens: inTok,
              outputTokens: outTok,
              reasoningTokens: rTok,
              totalTokens: inTok + outTok,
              costUSD: cost,
              latencyMs: Date.now() - startTime,
            };

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      usage: usageObj,
                      finishReason: chunk.response?.finishReason || m.finishReason,
                    }
                  : m
              )
            );
          }
        }

        const toolCalls = lastResponse?.toolCalls;

        if (!toolCalls || toolCalls.length === 0) {
          // Model finished its work, no further tool executions
          continueLoop = false;
          break;
        }

        // Record incoming tool calls in UI
        const newToolRecords: ToolCallRecord[] = toolCalls.map((call: any) => ({
          id: call.id,
          name: call.name,
          args: call.arguments || {},
          status: "running",
        }));

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  toolCalls: [...(m.toolCalls || []), ...newToolRecords],
                }
              : m
          )
        );

        // Execute each tool call
        for (const call of toolCalls) {
          const args = (call.arguments || {}) as Record<string, any>;
          const workspace = settings.activeWorkspacePath || "";

          try {
            if (call.name === "list_files") {
              const files = await listProjectFiles(workspace);
              const summary = files
                .map((f) => `${f.is_dir ? "[DIR] " : "      "}${f.path}`)
                .slice(0, 150)
                .join("\n");
              conductor.toolResult(call, summary);
              updateToolStatus(assistantMessageId, call.id, "completed", summary);
            } else if (call.name === "read_file") {
              const fileContent = await readFileContent(workspace, String(args.path || ""));
              conductor.toolResult(call, fileContent);
              updateToolStatus(
                assistantMessageId,
                call.id,
                "completed",
                `Read ${fileContent.length} bytes from ${args.path}`
              );
            } else if (call.name === "run_command") {
              const res = await runProjectCommand(workspace, String(args.command || ""));
              const output = `Exit code: ${res.exitCode}\nStdout:\n${res.stdout}\nStderr:\n${res.stderr}`;
              conductor.toolResult(call, output);
              updateToolStatus(
                assistantMessageId,
                call.id,
                res.success ? "completed" : "error",
                output
              );
            } else if (call.name === "write_file") {
              const relPath = String(args.path || "");
              const newContent = String(args.content || "");
              let oldContent = "";
              try {
                oldContent = await readFileContent(workspace, relPath);
              } catch {
                // File does not exist yet (new file)
              }

              // Dieter Rams Anti-Bloat Complexity Governor Check (toggleable)
              if (settings.antiBloatEnabled) {
                const bloatAudit = inspectDiffComplexity(relPath, oldContent, newContent);
                if (bloatAudit.isViolating) {
                  console.warn("Anti-Bloat Guard Notice:", bloatAudit.suggestedRemedy);
                }
              }

              const diff: FileDiff = {
                path: relPath,
                oldContent,
                newContent,
                isNewFile: !oldContent,
                approved: settings.autoApproveWrites ? true : undefined,
              };

              // Add diff to UI
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        fileDiffs: [...(m.fileDiffs || []).filter((d) => d.path !== relPath), diff],
                      }
                    : m
                )
              );

              // 3-Tier Security Level evaluation
              const isPathOutside =
                relPath.startsWith("..") || relPath.startsWith("/") || relPath.includes(":\\");
              let autoApproveThis = false;

              if (settings.securityLevel === "full_access") {
                autoApproveThis = true;
              } else if (settings.securityLevel === "sandbox") {
                autoApproveThis = !isPathOutside && Boolean(settings.autoApproveWrites);
              } else {
                // Strict: always require manual approval in DiffViewer
                autoApproveThis = false;
              }

              if (autoApproveThis) {
                await writeFileContent(workspace, relPath, newContent);
                conductor.toolResult(call, {
                  success: true,
                  message: `Successfully wrote ${relPath}`,
                });
                updateToolStatus(assistantMessageId, call.id, "completed", `Updated ${relPath}`);
                refreshWorkspaceFiles(workspace);
              } else {
                // Pause and await approval from DiffViewer
                updateToolStatus(assistantMessageId, call.id, "awaiting_approval");

                const approvalPromise = new Promise<boolean>((resolve) => {
                  pendingApprovalsRef.current.set(`${assistantMessageId}:${relPath}`, resolve);
                });

                const approved = await approvalPromise;

                if (approved) {
                  await writeFileContent(workspace, relPath, newContent);
                  conductor.toolResult(call, {
                    success: true,
                    message: `User approved and applied changes to ${relPath}`,
                  });
                  updateToolStatus(
                    assistantMessageId,
                    call.id,
                    "completed",
                    `Approved & wrote ${relPath}`
                  );
                  refreshWorkspaceFiles(workspace);
                } else {
                  conductor.toolResult(call, {
                    error: `User rejected file changes for ${relPath}`,
                  });
                  updateToolStatus(assistantMessageId, call.id, "error", `Changes rejected`);
                }
              }
            } else if (call.name === "fast_browser_action") {
              // Automatically open live interactive browser preview panel
              setIsBrowserOpen(true);

              const action = String(args.action || "navigate");
              const target = args.target ? String(args.target) : undefined;
              const value = args.value ? String(args.value) : undefined;
              const index = typeof args.index === "number" ? args.index : undefined;

              const res = await fastBrowserEngine.executeAction({
                action,
                target,
                value,
                index,
              });

              const toolResultSummary = {
                success: res.success,
                action: res.action,
                target: res.target,
                latencyMs: res.latencyMs,
                data: res.data,
                hasScreenshot: Boolean(res.screenshot),
                networkSummary: res.networkSummary,
                preFlightRequired: res.preFlightRequired,
              };

              conductor.toolResult(call, toolResultSummary);

              updateToolStatus(
                assistantMessageId,
                call.id,
                res.preFlightRequired ? "awaiting_approval" : res.success ? "completed" : "error",
                {
                  ...toolResultSummary,
                  screenshot: res.screenshot,
                }
              );
            } else if (call.name === "generate_ghost_twin") {
              const twinRes = generateGhostTwinDataset(args.schema || {}, args.count || 5);
              conductor.toolResult(call, twinRes);
              updateToolStatus(
                assistantMessageId,
                call.id,
                "completed",
                `Generated ${twinRes.records.length} synthetic ghost twin records with differential privacy.`
              );
            } else if (call.name === "synthesize_traffic") {
              const synthRes = synthesizeFromTraffic(args.recordedExchanges || []);
              conductor.toolResult(call, synthRes);
              updateToolStatus(
                assistantMessageId,
                call.id,
                "completed",
                `Synthesized TypeScript client SDK, ${synthRes.zodSchemas.length} Zod schemas, and mock handler.`
              );
            } else {
              // Check active MCP tools
              const matchingMcp = activeMcpTools.find((t) => t.name === call.name);
              if (matchingMcp) {
                const mcpRes = await matchingMcp.execute(args, workspace);
                conductor.toolResult(call, mcpRes);
                updateToolStatus(assistantMessageId, call.id, "completed", mcpRes);
              } else {
                conductor.toolResult(call, { error: `Tool ${call.name} is not recognized.` });
                updateToolStatus(assistantMessageId, call.id, "error", "Unrecognized tool");
              }
            }
          } catch (toolError: any) {
            const errText = toolError?.message || String(toolError);
            conductor.toolResult(call, { error: errText });
            updateToolStatus(assistantMessageId, call.id, "error", errText);
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        // User stopped manually
      } else {
        const errorMsg = (err as Error)?.message || "An unexpected error occurred.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: `Error: ${errorMsg}\n\nTip: Make sure your API key or local model endpoint is configured in Settings (top right).`,
                }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      if (messageQueueRef.current.length > 0) {
        const nextMsg = messageQueueRef.current.shift();
        setQueuedCount(messageQueueRef.current.length);
        if (nextMsg) {
          setTimeout(() => {
            handleSend(nextMsg);
          }, 150);
        }
      }
    }
  };

  const updateToolStatus = (
    messageId: string,
    toolId: string,
    status: ToolCallRecord["status"],
    result?: unknown
  ) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              toolCalls: m.toolCalls?.map((tc) =>
                tc.id === toolId ? { ...tc, status, result } : tc
              ),
            }
          : m
      )
    );
  };

  // Codex Harness Interactive Demonstration (for zero-config onboarding)
  const simulateCodexDemo = (prompt: string, assistantMessageId: string) => {
    const isBrowserPrompt =
      prompt.toLowerCase().includes("browser") ||
      prompt.toLowerCase().includes("tarayici") ||
      prompt.toLowerCase().includes("tarayıcı") ||
      prompt.toLowerCase().includes("web") ||
      prompt.toLowerCase().includes("site") ||
      prompt.toLowerCase().includes("ekran") ||
      prompt.toLowerCase().includes("youtube") ||
      prompt.toLowerCase().includes("google");

    if (isBrowserPrompt) {
      const lower = prompt.toLowerCase();
      let action = "navigate";
      let target: string | undefined = undefined;
      let val: string | undefined = undefined;
      let targetUrl = "https://www.google.com";

      if (lower.includes("youtube") || lower.includes("video")) {
        targetUrl = "https://www.youtube.com";
      } else if (lower.includes("localhost")) {
        targetUrl = "http://localhost:3000";
      }

      if (lower.includes("ara") || lower.includes("search") || lower.includes("bul")) {
        action = "search_and_select";
        val = prompt.replace(/(ara|search|bul|google'da|youtube'da|bize|için)/gi, "").trim() || "LLM Conductor";
      } else if (
        lower.includes("oynat") ||
        lower.includes("play") ||
        lower.includes("durdur") ||
        lower.includes("pause") ||
        lower.includes("sustur") ||
        lower.includes("mute")
      ) {
        action = "control_media";
        val = lower.includes("durdur") || lower.includes("pause")
          ? "pause"
          : lower.includes("sustur") || lower.includes("mute")
          ? "mute"
          : "play";
      } else if (lower.includes("özet") || lower.includes("metin") || lower.includes("oku") || lower.includes("extract")) {
        action = "extract_readable_text";
      } else if (lower.includes("kaydır") || lower.includes("scroll") || lower.includes("aşağı") || lower.includes("yukarı")) {
        action = "scroll";
        target = lower.includes("yukarı") || lower.includes("up") ? "up" : "down";
      } else {
        action = "navigate";
        target = targetUrl;
      }

      fastBrowserEngine
        .executeAction({ action, target, value: val, index: 0 })
        .then((res) => {
          const browserToolCalls: ToolCallRecord[] = [
            {
              id: `call_browser_${Date.now()}`,
              name: "fast_browser_action",
              args: { action, target: target || val || targetUrl, value: val },
              result: res,
              status: res.success ? "completed" : "error",
            },
          ];

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    reasoning: `1. Tarayıcı eylemi algılandı: "${action}".\n2. Chrome CDP (port 9222) ve Hayalet İmleç (Ghost Cursor) ile işlem yürütüldü: ${res.action}.\n3. Görsel geri bildirim (Vision Snapshot) alındı.`,
                    thinkingDurationMs: res.durationMs || 180,
                    toolCalls: browserToolCalls,
                    fileDiffs: [],
                    content: `Google Chrome üzerinde **${res.action}** eylemini gerçekleştirdim. Görsel anlık görüntü (Vision Snapshot) ve işlem durumu yukarıdaki kartta yer almaktadır.`,
                  }
                : m
            )
          );
        })
        .catch((err) => {
          openExternalUrl(targetUrl);
          const fallbackCalls: ToolCallRecord[] = [
            {
              id: `call_browser_fallback_${Date.now()}`,
              name: "fast_browser_action",
              args: { action: "navigate", target: targetUrl },
              result: `Chrome launched at ${targetUrl}: ${err.message}`,
              status: "completed",
            },
          ];
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    reasoning: `1. Chrome penceresi açıldı: ${targetUrl}.`,
                    thinkingDurationMs: 140,
                    toolCalls: fallbackCalls,
                    fileDiffs: [],
                    content: `Google Chrome penceresini açtım: **${targetUrl}**`,
                  }
                : m
            )
          );
        })
        .finally(() => {
          setIsStreaming(false);
        });
      return;
    }

    const hasWorkspace = Boolean(settings.activeWorkspacePath);
    const folderName = settings.activeWorkspacePath
      ? settings.activeWorkspacePath.replace(/\\/g, "/").split("/").pop()
      : "workspace";

    const demoToolCalls: ToolCallRecord[] = [
      {
        id: "call_list_files_demo",
        name: "list_files",
        args: { path: "" },
        result: `src/App.tsx\nsrc/components/TitleBar.tsx\npackage.json\ntsconfig.json`,
        status: "completed",
      },
      {
        id: "call_read_file_demo",
        name: "read_file",
        args: { path: "package.json" },
        result: `{\n  "name": "project",\n  "version": "1.0.0"\n}`,
        status: "completed",
      },
      {
        id: "call_write_file_demo",
        name: "write_file",
        args: { path: "src/conductor-harness.ts" },
        status: "completed",
      },
    ];

    const demoDiff: FileDiff = {
      path: "src/conductor-harness.ts",
      oldContent: "",
      newContent: `// Conductor Codex Sovereign Agent\nexport const harnessConfig = {\n  engine: "llm-conductor",\n  autonomous: true,\n  sandbox: "native-tauri",\n};`,
      isNewFile: true,
      approved: false,
    };

    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMessageId
          ? {
              ...m,
              reasoning: `1. Query analyzed: "${prompt.slice(0, 30)}..."\n2. Inspecting project structure in ${folderName}.\n3. Ready to read and write files with visual diff verification.`,
              thinkingDurationMs: 640,
              toolCalls: demoToolCalls,
              fileDiffs: [demoDiff],
              content: `Hello! I am **Conductor Codex**, running locally on your computer via Tauri and **llm-conductor**.\n\n${
                hasWorkspace
                  ? `I detected your workspace at **${settings.activeWorkspacePath}**. Above you can see how autonomous tool calls and visual diff approvals operate.`
                  : "You can click **Open Project** at the top left to bind Conductor directly to any code folder on your machine."
              }\n\nTo stream live from OpenAI, Anthropic, Gemini, DeepSeek, or your local Ollama instance, click **Settings** (top right) and enter your key.`,
            }
          : m
      )
    );
    setIsStreaming(false);
  };

  const handleSelectFile = (file: WorkspaceFile) => {
    setInput((prev) => (prev ? `${prev} @${file.path} ` : `@${file.path} `));
  };

  const handleContinueGenerating = (messageId: string) => {
    if (isStreaming) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    handleSend("Please continue exactly where you stopped. Do not repeat previous parts, output the remaining code directly.");
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-canvas text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
      {/* Frameless Apple/Codex TitleBar */}
      <TitleBar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onClearHistory={handleClearHistory}
        hasMessages={messages.length > 0}
        theme={settings.theme || "dark"}
        onToggleTheme={handleToggleTheme}
        workspacePath={settings.activeWorkspacePath}
        isWorkspaceOpen={isWorkspaceOpen}
        onToggleWorkspace={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
        securityLevel={settings.securityLevel}
      />

      {/* Main Area: Workspace File Drawer + Chat History + (Conversation Stream & Synchronized Prompt Bar) */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Unified Project & Chat Hub Sidebar */}
        <WorkspaceDrawer
          isOpen={isWorkspaceOpen}
          onClose={() => setIsWorkspaceOpen(false)}
          workspacePath={settings.activeWorkspacePath}
          files={workspaceFiles}
          isLoadingFiles={isLoadingFiles}
          onOpenProject={handleOpenProject}
          onCloseProject={handleCloseProject}
          onRefreshFiles={() => refreshWorkspaceFiles()}
          onSelectFile={handleSelectFile}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
        />

        {/* Unified Right Viewport: Conversation Stream + Spotlight Prompt Bar */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
          {/* Conversation Stream / Empty State */}
          <main className="flex-1 overflow-y-auto px-4 pt-6 pb-2 flex flex-col scroll-smooth">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto select-none animate-in fade-in duration-300">
                {/* Brand Enso Brushstroke Logo */}
                <div className="w-14 h-14 mb-4 flex items-center justify-center select-none">
                  <img
                    src={settings.theme === "light" ? logoLight : logoDark}
                    alt="Conductor Logo"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-base font-medium text-zinc-900 dark:text-zinc-100 tracking-tight">
                    Conductor
                  </h1>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500 border border-black/[0.06] dark:border-white/[0.06]">
                    AI Harness
                  </span>
                </div>

                <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed max-w-sm">
                  Sovereign, ultra-lightweight coding harness with native project file access, visual diff reviews, and local command execution.
                </p>

                {/* Workspace Action Banner if not connected */}
                {!settings.activeWorkspacePath ? (
                  <div className="w-full mb-4 p-3.5 rounded-xl bg-surface border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between shadow-subtle">
                    <div className="flex items-center gap-2.5 text-left">
                      <FolderOpen className="w-4 h-4 text-zinc-500 shrink-0" />
                      <div>
                        <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                          No Project Folder Selected
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Open a local folder to start inspecting and editing code.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenProject}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 text-xs font-medium transition-colors shrink-0 shadow-sm"
                    >
                      Open Folder
                    </button>
                  </div>
                ) : (
                  <div className="w-full mb-4 px-3 py-2 rounded-xl bg-surface border border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between text-xs font-mono text-zinc-600 dark:text-zinc-400 shadow-subtle">
                    <span className="truncate pr-2">📁 {settings.activeWorkspacePath}</span>
                    <button
                      type="button"
                      onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
                      className="text-[11px] text-zinc-800 dark:text-zinc-200 font-medium hover:underline shrink-0"
                    >
                      {isWorkspaceOpen ? "Hide Files" : "Browse Files"}
                    </button>
                  </div>
                )}

                {/* Quick Starter Prompts */}
                <div className="w-full space-y-2">
                  {[
                    "Scan the workspace and list the primary components and dependencies.",
                    "Inspect package.json and run tests using run_command.",
                    "Create a debounce utility in TypeScript with complete type tests.",
                  ].map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(suggestion)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-surface/70 hover:bg-surface-elevated border border-black/[0.06] dark:border-white/[0.05] hover:border-black/[0.15] dark:hover:border-white/[0.12] text-left text-xs text-zinc-700 dark:text-zinc-300 transition-all group shadow-sm"
                    >
                      <span className="truncate pr-2">{suggestion}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-800 dark:text-zinc-500 dark:group-hover:text-zinc-200 transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 max-w-3xl w-full mx-auto pb-4">
                {messages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    isStreaming={isStreaming && message.id === messages[messages.length - 1]?.id}
                    onApproveDiff={handleApproveDiff}
                    onRejectDiff={handleRejectDiff}
                    onContinue={handleContinueGenerating}
                  />
                ))}
                <div className="h-6" />
                <div ref={messagesEndRef} />
              </div>
            )}
          </main>

          {/* Floating Spotlight Prompt Bar */}
          <PromptBar
            input={input}
            setInput={setInput}
            onSubmit={() => handleSend()}
            onStop={handleStop}
            isStreaming={isStreaming}
            currentModel={currentModel}
            availableModels={allModels}
            onSelectModel={(modelId) =>
              setSettings((prev) => ({ ...prev, selectedModel: modelId }))
            }
            onAddCustomModel={handleAddCustomModel}
            onRemoveCustomModel={handleRemoveCustomModel}
            geminiModel={settings.geminiModel}
            onSelectGeminiModel={(modelId) =>
              setSettings((prev) => ({ ...prev, geminiModel: modelId }))
            }
            geminiKey={settings.geminiKey}
            onOpenSettings={() => setIsSettingsOpen(true)}
            activeModelName={
              currentModel.provider === "gemini"
                ? (settings.geminiModel || "gemini-3.8-flash")
                : currentModel.provider === "openai"
                ? (settings.openaiModel || "gpt-4o")
                : currentModel.provider === "anthropic"
                ? (settings.anthropicModel || "claude-3-7-sonnet-20250219")
                : currentModel.name
            }
            reasoningEnabled={settings.reasoningEnabled}
            reasoningEffort={settings.reasoningEffort || "medium"}
            onChangeReasoningEffort={(effort) =>
              setSettings((prev) => ({
                ...prev,
                reasoningEnabled: true,
                reasoningEffort: effort,
              }))
            }
            onDisableReasoning={() =>
              setSettings((prev) => ({ ...prev, reasoningEnabled: false }))
            }
            onSteer={handleSteer}
            onQueue={handleQueue}
            queuedCount={queuedCount}
          />
        </div>

        {/* Live Interactive Fast Browser Preview Side-Panel */}
        <BrowserPreviewPanel
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
        />
      </div>

      {/* Settings Modal with Integrated Token Usage & Cost Analytics */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={setSettings}
        usage={sessionUsage}
        onResetUsage={() => {
          setMessages((prev) => prev.map((m) => ({ ...m, usage: undefined })));
        }}
      />

      {/* Export TypeScript Code Modal */}
      <ExportCodeModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        messages={messages}
        currentModel={currentModel}
      />
    </div>
  );
}
