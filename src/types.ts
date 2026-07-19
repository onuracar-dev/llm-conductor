import { z } from "zod";

export type BuiltInProvider = "openai" | "anthropic" | "gemini";
export type Role = "system" | "user" | "assistant" | "tool";
export type JsonSchema = Record<string, unknown>;

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
  /** The provider's original JSON argument text, when one was available. */
  argumentsText?: string;
  /** Opaque data that must be replayed for some provider-specific tool turns. */
  providerMetadata?: Record<string, unknown>;
}

export interface Message {
  role: Role;
  content: string;
  /** Present on assistant messages that requested one or more tools. */
  toolCalls?: ToolCall[];
  /** Present on tool-result messages. */
  toolCallId?: string;
  /** Tool name. Required by some providers for tool-result messages. */
  name?: string;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: z.ZodTypeAny | JsonSchema;
}

export type ToolChoice = "auto" | "none" | "required" | { name: string };

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  /** Provider-native usage object for fields not covered above. */
  raw?: unknown;
}

export interface RetryOptions {
  /** Number of retries after the initial attempt. Defaults to 2. */
  maxRetries?: number;
  /** Initial exponential-backoff delay. Defaults to 250ms. */
  initialDelayMs?: number;
  /** Maximum client-computed delay. Defaults to 4 seconds. */
  maxDelayMs?: number;
  /** Exponential multiplier. Defaults to 2. */
  backoffMultiplier?: number;
  /** Apply full jitter to client-computed delays. Defaults to true. */
  jitter?: boolean;
  /** Override the default retryable HTTP statuses (408, 409, 425, 429, and 5xx). */
  retryableStatusCodes?: readonly number[];
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SharedConductorOptions {
  /** Explicit model name. Omit only when compatibility defaults are acceptable. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Overrides the selected provider's API root. */
  baseURL?: string;
  /** Additional request headers, useful for gateways and compatible APIs. */
  headers?: Record<string, string>;
  /** Inject a fetch implementation for custom runtimes or tests. */
  fetch?: FetchLike;
  /** Per-attempt timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number;
  retry?: RetryOptions;
}

export interface BuiltInConductorOptions extends SharedConductorOptions {
  provider: BuiltInProvider;
  apiKey: string;
}

export interface CustomProviderOptions extends SharedConductorOptions {
  provider: LLMProvider;
  /** Custom adapters may use this value or implement another auth mechanism. */
  apiKey?: string;
}

export type ConductorOptions = BuiltInConductorOptions | CustomProviderOptions;

export interface RunOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: RetryOptions;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  tools?: readonly ToolDefinition[];
  toolChoice?: ToolChoice;
}

export interface ProviderResponse<T = unknown> {
  content: T;
  raw: unknown;
  provider?: string;
  model?: string;
  /** Provider response/message identifier. */
  responseId?: string;
  /** HTTP request identifier returned in response headers, when available. */
  requestId?: string;
  finishReason?: string;
  refusal?: string;
  usage?: TokenUsage;
  toolCalls?: ToolCall[];
}

export interface TextDeltaEvent {
  type: "text_delta";
  delta: string;
  raw?: unknown;
}

export interface ToolCallDeltaEvent {
  type: "tool_call_delta";
  index: number;
  id?: string;
  name?: string;
  argumentsDelta: string;
  raw?: unknown;
}

export interface UsageEvent {
  type: "usage";
  usage: TokenUsage;
  raw?: unknown;
}

export interface StreamDoneEvent<T = unknown> {
  type: "done";
  response: ProviderResponse<T>;
}

export type ProviderStreamEvent<T = unknown> =
  | TextDeltaEvent
  | ToolCallDeltaEvent
  | UsageEvent
  | StreamDoneEvent<T>;

/**
 * Provider adapters receive the same options object supplied to Conductor.
 * The fourth parameter is optional so existing three-argument adapters remain valid.
 */
export interface LLMProvider {
  readonly name?: string;
  chat(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny,
    requestOptions?: RunOptions,
  ): Promise<ProviderResponse>;
  stream?(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny,
    requestOptions?: RunOptions,
  ): AsyncIterable<ProviderStreamEvent>;
}
