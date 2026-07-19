import { z } from "zod";
import { configurationError, providerResponseError } from "../errors";
import { joinURL, requestJson, requestSSE, responseRequestId } from "../http";
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

interface AnthropicMessage {
  role: "user" | "assistant";
  content: Array<Record<string, unknown>>;
}

function anthropicMessages(messages: Message[]): AnthropicMessage[] {
  const converted: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") continue;
    let role: AnthropicMessage["role"];
    let content: Array<Record<string, unknown>>;

    if (message.role === "tool") {
      role = "user";
      content = [{
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
      }];
    } else if (message.role === "assistant") {
      role = "assistant";
      content = [
        ...(message.content ? [{ type: "text", text: message.content }] : []),
        ...(message.toolCalls ?? []).map((call) => ({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.arguments,
        })),
      ];
    } else {
      role = "user";
      content = [{ type: "text", text: message.content }];
    }

    const previous = converted.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else converted.push({ role, content });
  }

  return converted;
}

function anthropicToolChoice(choice: ToolChoice | undefined): unknown {
  if (!choice || choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  if (choice === "none") return undefined;
  return { type: "tool", name: choice.name };
}

function requestBody(
  messages: Message[],
  options: ConductorOptions,
  schema: z.ZodTypeAny | undefined,
  requestOptions: RunOptions | undefined,
  stream: boolean,
): Record<string, unknown> {
  const userTools = normalizeTools(requestOptions?.tools);
  if (schema && userTools.length) {
    throw configurationError("Structured output and user tools cannot be requested in the same Anthropic call.");
  }

  const body: Record<string, unknown> = {
    model: resolveModel("anthropic", options, requestOptions),
    max_tokens: resolveMaxTokens(options, requestOptions),
    temperature: resolveTemperature(options, requestOptions),
    messages: anthropicMessages(messages),
  };
  if (stream) body.stream = true;

  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  if (system) body.system = system;

  if (schema) {
    body.tools = [{
      name: "output_formatter",
      description: "Return the final answer using the required JSON structure.",
      input_schema: zodToJsonSchema(schema),
    }];
    body.tool_choice = { type: "tool", name: "output_formatter" };
  } else if (userTools.length && requestOptions?.toolChoice !== "none") {
    body.tools = userTools.map((tool) => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      input_schema: tool.parameters,
    }));
    const choice = anthropicToolChoice(requestOptions?.toolChoice);
    if (choice) body.tool_choice = choice;
  }

  return body;
}

function usageFrom(value: unknown): TokenUsage | undefined {
  const usage = asRecord(value);
  if (!usage) return undefined;
  const inputTokens = asNumber(usage.input_tokens);
  const outputTokens = asNumber(usage.output_tokens);
  const cachedInputTokens = asNumber(usage.cache_read_input_tokens);
  return compactUsage({
    inputTokens,
    outputTokens,
    totalTokens: totalTokens(inputTokens, outputTokens),
    cachedInputTokens,
    raw: usage,
  });
}

function responseContent(
  blocksValue: unknown,
  schema: z.ZodTypeAny | undefined,
): { content: unknown; toolCalls: ToolCall[] } {
  const blocks = asArray(blocksValue);
  const text = blocks
    .map((block) => {
      const record = asRecord(block);
      return record?.type === "text" ? asString(record.text) ?? "" : "";
    })
    .join("");
  const calls = blocks.flatMap((block, index) => {
    const record = asRecord(block);
    if (record?.type !== "tool_use") return [];
    const name = asString(record.name) ?? `tool_${index}`;
    const input = record.input ?? {};
    const argumentsText = JSON.stringify(input);
    return [parseToolCall(asString(record.id) ?? `anthropic-${index}-${name}`, name, argumentsText)];
  });

  if (schema) {
    const formatter = calls.find((call) => call.name === "output_formatter");
    if (!formatter) {
      throw providerResponseError("anthropic", "Anthropic did not return the structured-output tool call.", blocks);
    }
    return { content: formatter.arguments, toolCalls: [] };
  }
  return { content: text, toolCalls: calls };
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  async chat(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny,
    requestOptions?: RunOptions,
  ): Promise<ProviderResponse> {
    const model = resolveModel("anthropic", options, requestOptions);
    const { data, response } = await requestJson<Record<string, unknown>>({
      provider: "anthropic",
      url: joinURL(resolveBaseURL("anthropic", options), "messages"),
      init: {
        method: "POST",
        headers: mergeHeaders({
          "Content-Type": "application/json",
          "x-api-key": options.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        }, options, requestOptions),
        body: JSON.stringify(requestBody(messages, options, schema, requestOptions, false)),
      },
      options,
      requestOptions,
    });

    if (!Array.isArray(data.content)) {
      throw providerResponseError("anthropic", "Anthropic returned no content blocks.", data);
    }
    const parsed = responseContent(data.content, schema);

    return {
      content: parsed.content,
      raw: data,
      provider: "anthropic",
      model: asString(data.model) ?? model,
      responseId: asString(data.id),
      requestId: responseRequestId(response),
      finishReason: asString(data.stop_reason),
      usage: usageFrom(data.usage),
      ...(parsed.toolCalls.length ? { toolCalls: parsed.toolCalls } : {}),
    };
  }

  async *stream(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny,
    requestOptions?: RunOptions,
  ): AsyncIterable<ProviderStreamEvent> {
    const requestedModel = resolveModel("anthropic", options, requestOptions);
    let content = "";
    let model = requestedModel;
    let responseId: string | undefined;
    let finishReason: string | undefined;
    let usage: TokenUsage | undefined;
    let raw: unknown;
    let sawData = false;
    const calls = new Map<number, { id: string; name: string; argumentsText: string }>();

    for await (const message of requestSSE({
      provider: "anthropic",
      url: joinURL(resolveBaseURL("anthropic", options), "messages"),
      init: {
        method: "POST",
        headers: mergeHeaders({
          "Content-Type": "application/json",
          "x-api-key": options.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        }, options, requestOptions),
        body: JSON.stringify(requestBody(messages, options, schema, requestOptions, true)),
      },
      options,
      requestOptions,
    })) {
      const event = parseStreamJson("anthropic", message.data);
      assertNoStreamError("anthropic", event);
      sawData = true;
      raw = event;
      const type = asString(event.type) ?? message.event;

      if (type === "message_start") {
        const started = asRecord(event.message);
        responseId = asString(started?.id) ?? responseId;
        model = asString(started?.model) ?? model;
        const nextUsage = usageFrom(started?.usage);
        if (nextUsage) {
          usage = nextUsage;
          yield { type: "usage", usage: nextUsage, raw: event };
        }
      } else if (type === "content_block_start") {
        const index = asNumber(event.index) ?? calls.size;
        const block = asRecord(event.content_block);
        if (block?.type === "text") {
          const text = asString(block.text) ?? "";
          if (text) {
            content += text;
            yield { type: "text_delta", delta: text, raw: event };
          }
        } else if (block?.type === "tool_use") {
          const name = asString(block.name) ?? `tool_${index}`;
          const initialInput = asRecord(block.input);
          const argumentsText = initialInput && Object.keys(initialInput).length
            ? JSON.stringify(initialInput)
            : "";
          calls.set(index, {
            id: asString(block.id) ?? `anthropic-${index}-${name}`,
            name,
            argumentsText,
          });
          yield {
            type: "tool_call_delta",
            index,
            id: asString(block.id),
            name,
            argumentsDelta: argumentsText,
            raw: event,
          };
        }
      } else if (type === "content_block_delta") {
        const index = asNumber(event.index) ?? 0;
        const delta = asRecord(event.delta);
        if (delta?.type === "text_delta") {
          const text = asString(delta.text) ?? "";
          content += text;
          if (text) yield { type: "text_delta", delta: text, raw: event };
        } else if (delta?.type === "input_json_delta") {
          const argumentsDelta = asString(delta.partial_json) ?? "";
          const current = calls.get(index) ?? {
            id: `anthropic-${index}-tool`,
            name: `tool_${index}`,
            argumentsText: "",
          };
          current.argumentsText += argumentsDelta;
          calls.set(index, current);
          yield { type: "tool_call_delta", index, argumentsDelta, raw: event };
        }
      } else if (type === "message_delta") {
        const delta = asRecord(event.delta);
        finishReason = asString(delta?.stop_reason) ?? finishReason;
        const deltaUsage = usageFrom(event.usage);
        if (deltaUsage) {
          usage = {
            ...usage,
            ...deltaUsage,
            inputTokens: deltaUsage.inputTokens ?? usage?.inputTokens,
            outputTokens: deltaUsage.outputTokens ?? usage?.outputTokens,
            cachedInputTokens: deltaUsage.cachedInputTokens ?? usage?.cachedInputTokens,
            reasoningTokens: deltaUsage.reasoningTokens ?? usage?.reasoningTokens,
            totalTokens: totalTokens(
              deltaUsage.inputTokens ?? usage?.inputTokens,
              deltaUsage.outputTokens ?? usage?.outputTokens,
            ),
          };
          yield { type: "usage", usage, raw: event };
        }
      }
    }

    if (!sawData) {
      throw providerResponseError("anthropic", "Anthropic returned an empty stream.");
    }

    const toolCalls = [...calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => parseToolCall(call.id, call.name, call.argumentsText));
    let finalContent: unknown = content;
    let exposedCalls = toolCalls;
    if (schema) {
      const formatter = toolCalls.find((call) => call.name === "output_formatter");
      if (!formatter) {
        throw providerResponseError("anthropic", "Anthropic did not stream the structured-output tool call.", raw);
      }
      finalContent = formatter.arguments;
      exposedCalls = [];
    }

    yield {
      type: "done",
      response: {
        content: finalContent,
        raw,
        provider: "anthropic",
        model,
        responseId,
        finishReason,
        usage,
        ...(exposedCalls.length ? { toolCalls: exposedCalls } : {}),
      },
    };
  }
}
