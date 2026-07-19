import { z } from "zod";
import { AnthropicProvider, GeminiProvider, OpenAIProvider } from "./providers";
import { ConductorError, configurationError, isConductorError } from "./errors";
import type {
  BuiltInProvider,
  ConductorOptions,
  LLMProvider,
  Message,
  ProviderResponse,
  ProviderStreamEvent,
  RunOptions,
  ToolCall,
  ToolChoice,
  ToolDefinition,
} from "./types";
import { normalizeTools } from "./utils/tools";

function isBuiltInProvider(value: unknown): value is BuiltInProvider {
  return value === "openai" || value === "anthropic" || value === "gemini";
}

function providerFor(name: BuiltInProvider): LLMProvider {
  if (name === "openai") return new OpenAIProvider();
  if (name === "anthropic") return new AnthropicProvider();
  return new GeminiProvider();
}

function cloneToolCall(call: ToolCall): ToolCall {
  let clonedArguments = call.arguments;
  if (typeof globalThis.structuredClone === "function") {
    try {
      clonedArguments = globalThis.structuredClone(call.arguments);
    } catch {
      // Provider tool arguments are normally JSON values; retain unusual adapter values by reference.
    }
  }
  return {
    ...call,
    arguments: clonedArguments,
    ...(call.providerMetadata ? { providerMetadata: { ...call.providerMetadata } } : {}),
  };
}

function cloneMessage(message: Message): Message {
  return {
    ...message,
    ...(message.toolCalls ? { toolCalls: message.toolCalls.map(cloneToolCall) } : {}),
  };
}

function stringifyResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export class Conductor<T = string> {
  private history: Message[] = [];
  private schema?: z.ZodType<T>;
  private readonly providerInstance: LLMProvider;
  private readonly providerName: string;
  private configuredTools?: readonly ToolDefinition[];
  private configuredToolChoice?: ToolChoice;
  private lastResponse?: ProviderResponse<T>;

  constructor(private readonly options: ConductorOptions) {
    if (!options || typeof options !== "object") {
      throw configurationError("Conductor options are required.");
    }

    if (typeof options.provider === "string") {
      if (!isBuiltInProvider(options.provider)) {
        throw configurationError(`Unsupported provider: ${options.provider}`);
      }
      if (typeof options.apiKey !== "string" || !options.apiKey.trim()) {
        throw configurationError("API key is required for built-in providers.");
      }
      this.providerInstance = providerFor(options.provider);
      this.providerName = options.provider;
    } else if (options.provider && typeof options.provider.chat === "function") {
      this.providerInstance = options.provider;
      this.providerName = options.provider.name?.trim() || "custom";
    } else {
      throw configurationError("`provider` must be a built-in provider name or an LLMProvider adapter.");
    }

    if (options.model !== undefined && !options.model.trim()) {
      throw configurationError("`model` cannot be an empty string.");
    }
    if (options.temperature !== undefined && !Number.isFinite(options.temperature)) {
      throw configurationError("`temperature` must be a finite number.");
    }
    if (options.maxTokens !== undefined && (!Number.isInteger(options.maxTokens) || options.maxTokens <= 0)) {
      throw configurationError("`maxTokens` must be a positive integer.");
    }
  }

  system(content: string): this {
    return this.addMessage("system", content);
  }

  user(content: string): this {
    return this.addMessage("user", content);
  }

  assistant(content: string): this {
    return this.addMessage("assistant", content);
  }

  private addMessage(role: "system" | "user" | "assistant", content: string): this {
    if (typeof content !== "string") {
      throw configurationError(`${role} message content must be a string.`);
    }
    this.history.push({ role, content });
    return this;
  }

  withSchema<USchema extends z.ZodTypeAny>(schema: USchema): Conductor<z.infer<USchema>> {
    if (!schema || typeof schema.parse !== "function") {
      throw configurationError("`withSchema` requires a Zod schema.");
    }
    this.schema = schema as unknown as z.ZodType<T>;
    return this as unknown as Conductor<z.infer<USchema>>;
  }

  withTools(tools: readonly ToolDefinition[], toolChoice: ToolChoice = "auto"): this {
    normalizeTools(tools);
    this.configuredTools = [...tools];
    this.configuredToolChoice = toolChoice;
    return this;
  }

  clearTools(): this {
    this.configuredTools = undefined;
    this.configuredToolChoice = undefined;
    return this;
  }

  /** Add the result of a tool call before continuing the conversation. */
  toolResult(
    call: ToolCall | Pick<ToolCall, "id" | "name"> | string,
    result: unknown,
    name?: string,
  ): this {
    let toolCallId: string;
    let toolName: string | undefined;
    if (typeof call === "string") {
      toolCallId = call;
      toolName = name ?? this.findToolName(call);
    } else {
      toolCallId = call.id;
      toolName = call.name;
    }
    if (!toolCallId) throw configurationError("A tool-call id is required.");
    if (!toolName) {
      throw configurationError(
        "A tool name is required when the tool call is not present in conversation history.",
      );
    }

    let content: string;
    try {
      content = typeof result === "string" ? result : JSON.stringify(result);
    } catch (cause) {
      throw new ConductorError("The tool result could not be serialized as JSON.", {
        code: "CONFIGURATION_ERROR",
        cause,
      });
    }
    this.history.push({
      role: "tool",
      content: content ?? "null",
      toolCallId,
      name: toolName,
    });
    return this;
  }

  /** Alias for `toolResult`. */
  tool(
    call: ToolCall | Pick<ToolCall, "id" | "name"> | string,
    result: unknown,
    name?: string,
  ): this {
    return this.toolResult(call, result, name);
  }

  async run(options?: RunOptions): Promise<T> {
    const response = await this.runWithMetadata(options);
    return response.content;
  }

  async runWithMetadata(options?: RunOptions): Promise<ProviderResponse<T>> {
    const requestOptions = this.resolveRunOptions(options);
    try {
      const response = await this.providerInstance.chat(
        this.getHistory(),
        this.options,
        this.schema,
        requestOptions,
      );
      const validated = this.validateResponse(response);
      this.commitResponse(validated);
      return validated;
    } catch (error) {
      throw this.normalizeProviderError(error);
    }
  }

  async *stream(options?: RunOptions): AsyncIterable<ProviderStreamEvent<T>> {
    if (!this.providerInstance.stream) {
      throw new ConductorError(`Provider adapter "${this.providerName}" does not support streaming.`, {
        code: "UNSUPPORTED_FEATURE",
        provider: this.providerName,
      });
    }

    const requestOptions = this.resolveRunOptions(options);
    try {
      for await (const event of this.providerInstance.stream(
        this.getHistory(),
        this.options,
        this.schema,
        requestOptions,
      )) {
        if (event.type !== "done") {
          yield event;
          continue;
        }
        const validated = this.validateResponse(event.response);
        this.commitResponse(validated);
        yield { type: "done", response: validated };
        return;
      }
      throw new ConductorError(`Provider adapter "${this.providerName}" ended without a done event.`, {
        code: "STREAM_ERROR",
        provider: this.providerName,
      });
    } catch (error) {
      throw this.normalizeProviderError(error);
    }
  }

  getHistory(): Message[] {
    return this.history.map(cloneMessage);
  }

  getLastResponse(): ProviderResponse<T> | undefined {
    if (!this.lastResponse) return undefined;
    return {
      ...this.lastResponse,
      ...(this.lastResponse.toolCalls
        ? { toolCalls: this.lastResponse.toolCalls.map(cloneToolCall) }
        : {}),
    };
  }

  clearHistory(): this {
    this.history = [];
    return this;
  }

  private findToolName(toolCallId: string): string | undefined {
    for (let index = this.history.length - 1; index >= 0; index -= 1) {
      const found = this.history[index]?.toolCalls?.find((call) => call.id === toolCallId);
      if (found) return found.name;
    }
    return undefined;
  }

  private resolveRunOptions(options: RunOptions | undefined): RunOptions | undefined {
    const tools = options?.tools ?? this.configuredTools;
    const toolChoice = options?.toolChoice ?? this.configuredToolChoice;
    if (tools) normalizeTools(tools);
    if (this.schema && tools?.length) {
      throw configurationError(
        "Structured output and tool calls are separate operations; do not request both in one run.",
      );
    }
    if (toolChoice && toolChoice !== "none" && !tools?.length) {
      throw configurationError("A non-`none` tool choice requires at least one tool definition.");
    }
    if (typeof toolChoice === "object" && !tools?.some((tool) => tool.name === toolChoice.name)) {
      throw configurationError(`Tool choice references an undefined tool: ${toolChoice.name}`);
    }
    if (options?.model !== undefined && !options.model.trim()) {
      throw configurationError("`model` cannot be an empty string.");
    }
    if (options?.temperature !== undefined && !Number.isFinite(options.temperature)) {
      throw configurationError("`temperature` must be a finite number.");
    }
    if (options?.maxTokens !== undefined
      && (!Number.isInteger(options.maxTokens) || options.maxTokens <= 0)) {
      throw configurationError("`maxTokens` must be a positive integer.");
    }
    if (!options && !tools && !toolChoice) return undefined;
    return {
      ...options,
      ...(tools ? { tools } : {}),
      ...(toolChoice ? { toolChoice } : {}),
    };
  }

  private validateResponse(response: ProviderResponse): ProviderResponse<T> {
    if (!response || typeof response !== "object" || !("content" in response)) {
      throw new ConductorError(`Provider adapter "${this.providerName}" returned an invalid response.`, {
        code: "PROVIDER_RESPONSE_ERROR",
        provider: this.providerName,
        details: response,
      });
    }

    let content: unknown = response.content;
    if (this.schema) {
      if (typeof content === "string") {
        const serializedContent = content;
        try {
          content = JSON.parse(serializedContent);
        } catch (cause) {
          throw new ConductorError("The provider returned malformed JSON for the requested schema.", {
            code: "VALIDATION_ERROR",
            provider: this.providerName,
            details: { content: serializedContent.slice(0, 1_000) },
            cause,
          });
        }
      }
      try {
        content = this.schema.parse(content);
      } catch (cause) {
        throw new ConductorError("The provider output did not match the requested schema.", {
          code: "VALIDATION_ERROR",
          provider: this.providerName,
          details: cause instanceof z.ZodError ? { issues: cause.issues } : undefined,
          cause,
        });
      }
    }

    return {
      ...response,
      content: content as T,
      provider: response.provider ?? this.providerName,
    };
  }

  private commitResponse(response: ProviderResponse<T>): void {
    this.lastResponse = response;
    this.history.push({
      role: "assistant",
      content: stringifyResult(response.content),
      ...(response.toolCalls?.length
        ? { toolCalls: response.toolCalls.map(cloneToolCall) }
        : {}),
    });
  }

  private normalizeProviderError(error: unknown): ConductorError {
    if (isConductorError(error)) return error;
    return new ConductorError(
      error instanceof Error ? error.message : `Provider adapter "${this.providerName}" failed.`,
      {
        code: "PROVIDER_ERROR",
        provider: this.providerName,
        cause: error,
      },
    );
  }
}
