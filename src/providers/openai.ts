import { z } from "zod";
import { requestJson, requestSSE, joinURL, responseRequestId } from "../http";
import { providerResponseError } from "../errors";
import type {
  ConductorOptions,
  LLMProvider,
  Message,
  ProviderResponse,
  ProviderStreamEvent,
  RunOptions,
  TokenUsage,
  ToolCall,
  ToolChoice,
} from "../types";
import { zodToJsonSchema } from "../utils/schema";
import { normalizeTools, parseToolCall } from "../utils/tools";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  assertNoStreamError,
  compactUsage,
  mergeHeaders,
  parseStreamJson,
  resolveBaseURL,
  resolveMaxTokens,
  resolveModel,
  resolveTemperature,
  totalTokens,
} from "./shared";

function openAIMessages(messages: Message[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
        ...(message.name ? { name: message.name } : {}),
      };
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: call.argumentsText ?? JSON.stringify(call.arguments),
          },
        })),
      };
    }

    return { role: message.role, content: message.content };
  });
}

function openAIToolChoice(choice: ToolChoice | undefined): unknown {
  if (!choice || typeof choice === "string") return choice;
  return { type: "function", function: { name: choice.name } };
}

function requestBody(
  messages: Message[],
  options: ConductorOptions,
  schema: z.ZodTypeAny | undefined,
  requestOptions: RunOptions | undefined,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: resolveModel("openai", options, requestOptions),
    messages: openAIMessages(messages),
    temperature: resolveTemperature(options, requestOptions),
  };
  const maxTokens = requestOptions?.maxTokens ?? options.maxTokens;
  if (maxTokens !== undefined) body.max_tokens = resolveMaxTokens(options, requestOptions);
  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }

  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "output_schema",
        strict: true,
        schema: zodToJsonSchema(schema),
      },
    };
  }

  const tools = normalizeTools(requestOptions?.tools);
  if (tools.length) {
    body.tools = tools.map((tool) => ({ type: "function", function: tool }));
    body.tool_choice = openAIToolChoice(requestOptions?.toolChoice ?? "auto");
  }

  return body;
}

function usageFrom(value: unknown): TokenUsage | undefined {
  const usage = asRecord(value);
  if (!usage) return undefined;
  const promptDetails = asRecord(usage.prompt_tokens_details);
  const completionDetails = asRecord(usage.completion_tokens_details);
  const inputTokens = asNumber(usage.prompt_tokens);
  const outputTokens = asNumber(usage.completion_tokens);
  return compactUsage({
    inputTokens,
    outputTokens,
    totalTokens: totalTokens(inputTokens, outputTokens, asNumber(usage.total_tokens)),
    cachedInputTokens: asNumber(promptDetails?.cached_tokens),
    reasoningTokens: asNumber(completionDetails?.reasoning_tokens),
    raw: usage,
  });
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  return asArray(value)
    .map((part) => {
      const record = asRecord(part);
      return asString(record?.text) ?? "";
    })
    .join("");
}

function toolCallsFrom(value: unknown): ToolCall[] {
  return asArray(value).map((item, index) => {
    const call = asRecord(item);
    const fn = asRecord(call?.function);
    const name = asString(fn?.name) ?? `tool_${index}`;
    const id = asString(call?.id) ?? `openai-${index}-${name}`;
    return parseToolCall(id, name, asString(fn?.arguments) ?? "");
  });
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";

  async chat(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny,
    requestOptions?: RunOptions,
  ): Promise<ProviderResponse> {
    const model = resolveModel("openai", options, requestOptions);
    const { data, response } = await requestJson<Record<string, unknown>>({
      provider: "openai",
      url: joinURL(resolveBaseURL("openai", options), "chat/completions"),
      init: {
        method: "POST",
        headers: mergeHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey ?? ""}`,
        }, options, requestOptions),
        body: JSON.stringify(requestBody(messages, options, schema, requestOptions, false)),
      },
      options,
      requestOptions,
    });

    const choice = asRecord(asArray(data.choices)[0]);
    const message = asRecord(choice?.message);
    if (!choice || !message) {
      throw providerResponseError("openai", "OpenAI returned no completion choice.", data);
    }
    const toolCalls = toolCallsFrom(message.tool_calls);

    return {
      content: textContent(message.content),
      raw: data,
      provider: "openai",
      model: asString(data.model) ?? model,
      responseId: asString(data.id),
      requestId: responseRequestId(response),
      finishReason: asString(choice.finish_reason),
      refusal: asString(message.refusal),
      usage: usageFrom(data.usage),
      ...(toolCalls.length ? { toolCalls } : {}),
    };
  }

  async *stream(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny,
    requestOptions?: RunOptions,
  ): AsyncIterable<ProviderStreamEvent> {
    const requestedModel = resolveModel("openai", options, requestOptions);
    let content = "";
    let model = requestedModel;
    let responseId: string | undefined;
    let finishReason: string | undefined;
    let usage: TokenUsage | undefined;
    let raw: unknown;
    let sawData = false;
    const calls = new Map<number, { id: string; name: string; argumentsText: string }>();

    for await (const message of requestSSE({
      provider: "openai",
      url: joinURL(resolveBaseURL("openai", options), "chat/completions"),
      init: {
        method: "POST",
        headers: mergeHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey ?? ""}`,
        }, options, requestOptions),
        body: JSON.stringify(requestBody(messages, options, schema, requestOptions, true)),
      },
      options,
      requestOptions,
    })) {
      if (message.data === "[DONE]") break;
      const event = parseStreamJson("openai", message.data);
      assertNoStreamError("openai", event);
      sawData = true;
      raw = event;
      responseId = asString(event.id) ?? responseId;
      model = asString(event.model) ?? model;

      const nextUsage = usageFrom(event.usage);
      if (nextUsage) {
        usage = nextUsage;
        yield { type: "usage", usage: nextUsage, raw: event };
      }

      const choice = asRecord(asArray(event.choices)[0]);
      if (!choice) continue;
      finishReason = asString(choice.finish_reason) ?? finishReason;
      const delta = asRecord(choice.delta);
      const text = asString(delta?.content);
      if (text) {
        content += text;
        yield { type: "text_delta", delta: text, raw: event };
      }

      for (const item of asArray(delta?.tool_calls)) {
        const call = asRecord(item);
        const index = asNumber(call?.index) ?? calls.size;
        const fn = asRecord(call?.function);
        const current = calls.get(index) ?? { id: "", name: "", argumentsText: "" };
        current.id += asString(call?.id) ?? "";
        current.name += asString(fn?.name) ?? "";
        const argumentsDelta = asString(fn?.arguments) ?? "";
        current.argumentsText += argumentsDelta;
        calls.set(index, current);
        yield {
          type: "tool_call_delta",
          index,
          ...(asString(call?.id) ? { id: asString(call?.id) } : {}),
          ...(asString(fn?.name) ? { name: asString(fn?.name) } : {}),
          argumentsDelta,
          raw: event,
        };
      }
    }

    if (!sawData) {
      throw providerResponseError("openai", "OpenAI returned an empty stream.");
    }

    const toolCalls = [...calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, call]) => parseToolCall(
        call.id || `openai-${index}-${call.name || "tool"}`,
        call.name || `tool_${index}`,
        call.argumentsText,
      ));

    yield {
      type: "done",
      response: {
        content,
        raw,
        provider: "openai",
        model,
        responseId,
        finishReason,
        usage,
        ...(toolCalls.length ? { toolCalls } : {}),
      },
    };
  }
}
