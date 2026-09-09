export type ProviderKey = "openai" | "anthropic" | "gemini" | "deepseek" | "custom";

export interface ModelOption {
  id: string;
  name: string;
  provider: ProviderKey;
  description: string;
  supportsReasoning?: boolean;
  isNew?: boolean;
  isCustom?: boolean;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "openai",
    name: "GPT API",
    provider: "openai",
    description: "OpenAI GPT models with native streaming & reasoning",
    supportsReasoning: true,
  },
  {
    id: "anthropic",
    name: "Claude API",
    provider: "anthropic",
    description: "Anthropic Claude models with extended thinking",
    supportsReasoning: true,
  },
  {
    id: "gemini",
    name: "Gemini API",
    provider: "gemini",
    description: "Google Gemini 3.8 Flash, 3.7 Flash & 3.1 Pro models",
    supportsReasoning: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek API",
    provider: "deepseek",
    description: "DeepSeek reasoning & chat completion models",
    supportsReasoning: true,
  },
  {
    id: "custom",
    name: "Local / Custom API",
    provider: "custom",
    description: "Ollama, vLLM, LM Studio or OpenAI-compatible endpoint",
  },
];

export interface WorkspaceFile {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "running" | "completed" | "error" | "awaiting_approval";
}

export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  isNewFile: boolean;
  approved?: boolean;
}

export type SecurityLevel = "strict" | "sandbox" | "full_access";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens: number;
  costUSD: number;
  latencyMs?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  thinkingDurationMs?: number;
  model?: string;
  provider?: ProviderKey;
  timestamp: number;
  toolCalls?: ToolCallRecord[];
  fileDiffs?: FileDiff[];
  finishReason?: string;
  usage?: TokenUsage;
  steered?: boolean;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
  toolsCount?: number;
}

export interface PluginConfig {
  id: string;
  name: string;
  description: string;
  icon?: string;
  enabled: boolean;
  category: "git" | "database" | "browser" | "system" | "devtools";
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  model?: string;
  provider?: ProviderKey;
  totalCostUSD?: number;
  workspacePath?: string;
}

export interface AntiBloatCheckResult {
  passed: boolean;
  isViolating?: boolean;
  suggestedRemedy?: string;
  warnings: string[];
  suggestions: string[];
  bloatScore: number;
}

export interface AppSettings {
  theme?: "dark" | "light";
  activeWorkspacePath?: string;
  autoApproveWrites?: boolean;
  securityLevel: SecurityLevel;
  antiBloatEnabled: boolean;
  reasoningEnabled?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  selectedSubModel?: string;
  geminiModel?: string;
  openaiModel?: string;
  anthropicModel?: string;
  deepseekModel?: string;
  openaiKey: string;
  anthropicKey: string;
  geminiKey: string;
  deepseekKey: string;
  customBaseURL: string;
  customApiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  customModels?: ModelOption[];
  mcpServers: MCPServerConfig[];
  plugins: PluginConfig[];
  browserAutomationUrl?: string;
  browserDryRunEnabled?: boolean;
}

export const DEFAULT_PLUGINS: PluginConfig[] = [
  {
    id: "git-companion",
    name: "Git Companion",
    description: "Inspect branch history, staging status, and generate semantic git commits.",
    icon: "GitBranch",
    enabled: true,
    category: "git",
  },
  {
    id: "db-inspector",
    name: "Database Inspector",
    description: "Safe read-only exploration of local SQLite, Postgres, and Prisma schemas.",
    icon: "Database",
    enabled: true,
    category: "database",
  },
  {
    id: "browser-controller",
    name: "Hyper-Fast Browser",
    description: "Sub-100ms native headless browser automation, DOM inspector, and visual action dispatcher.",
    icon: "Globe",
    enabled: true,
    category: "browser",
  },
  {
    id: "ghost-twin",
    name: "Production Ghost Twin",
    description: "Synthesizes realistic zero-PII synthetic datasets for edge-case local debugging.",
    icon: "CopyCheck",
    enabled: true,
    category: "devtools",
  },
  {
    id: "traffic-synthesizer",
    name: "Traffic-to-FullStack",
    description: "Reverse-engineers network traffic and HAR streams into clean TypeScript SDKs & Mock Servers.",
    icon: "Network",
    enabled: true,
    category: "devtools",
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  activeWorkspacePath: "",
  autoApproveWrites: false,
  securityLevel: "sandbox",
  antiBloatEnabled: true,
  reasoningEnabled: true,
  reasoningEffort: "medium",
  selectedSubModel: "",
  geminiModel: "gemini-3.8-flash",
  openaiModel: "gpt-4o",
  anthropicModel: "claude-3-7-sonnet-20250219",
  deepseekModel: "deepseek-chat",
  openaiKey: "",
  anthropicKey: "",
  geminiKey: "",
  deepseekKey: "",
  customBaseURL: "http://localhost:11434/v1",
  customApiKey: "ollama",
  selectedModel: "gemini",
  temperature: 0.7,
  maxTokens: 65536,
  customModels: [],
  mcpServers: [
    {
      id: "filesystem-mcp",
      name: "Filesystem MCP",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
      enabled: false,
      toolsCount: 6,
    },
    {
      id: "git-mcp",
      name: "Git MCP",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-git"],
      enabled: false,
      toolsCount: 8,
    },
  ],
  plugins: DEFAULT_PLUGINS,
  browserAutomationUrl: "http://localhost:3000",
  browserDryRunEnabled: false,
};

