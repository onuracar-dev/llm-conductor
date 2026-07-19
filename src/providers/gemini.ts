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

interface GeminiContent {
  role: "user" | "model";
  parts: Array<Record<string, unknown>>;
}

function parseToolResultContent(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content);
    return asRecord(parsed) ?? { result: parsed };
  } catch {
    return { result: content };
  }
}

function geminiMessages(messages: Message[]): GeminiContent[] {
  const converted: GeminiContent[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const role: GeminiContent["role"] = message.role === "assistant" ? "model" : "user";
    let parts: Array<Record<string, unknown>>;

    if (message.role === "tool") {
      parts = [{
        functionResponse: {
          id: message.toolCallId,
          name: message.name ?? message.toolCallId ?? "tool",
          response: parseToolResultContent(message.content),
        },
      }];
    } else if (message.role === "assistant") {
      parts = [
        ...(message.content ? [{ text: message.content }] : []),
        ...(message.toolCalls ?? []).map((call) => ({
          functionCall: { name: call.name, args: call.arguments, id: call.id },
          ...(typeof call.providerMetadata?.thoughtSignature === "string"
            ? { thoughtSignature: call.providerMetadata.thoughtSignature }
            : {}),
        })),
      ];
    } else {
      parts = [{ text: message.content }];
    }

    const previous = converted.at(-1);
    if (previous?.role === role) {
      const previousText = asString(previous.parts.at(-1)?.text);
      const nextText = asString(parts[0]?.text);
      if (previousText !== undefined && nextText !== undefined) {
        previous.parts[previous.parts.length - 1] = { text: `${previousText}\n\n${nextText}` };
        previous.parts.push(...parts.slice(1));
      } else {
        previous.parts.push(...parts);
      }
    } else converted.push({ role, parts });
  }
  return converted;
}

function geminiToolConfig(choice: ToolChoice | undefined): Record<string, unknown> {
  if (!choice || choice === "auto") return { mode: "AUTO" };
  if (choice === "none") return { mode: "NONE" };
  if (choice === "required") return { mode: "ANY" };
  return { mode: "ANY", allowedFunctionNames: [choice.name] };
}

function requestBody(
  messages: Message[],
  options: ConductorOptions,
  schema: z.ZodTypeAny | undefined,
  requestOptions: RunOptions | undefined,
): Record<string, unknown> {
  const userTools = normalizeTools(requestOptions?.tools);
  if (schema && userTools.length) {
    throw configurationError("Structured output and user tools cannot be requested in the same Gemini call.");
  }

  const body: Record<string, unknown> = {
    contents: geminiMessages(messages),
    generationConfig: {
      temperature: resolveTemperature(options, requestOptions),
      ...(requestOptions?.maxTokens !== undefined || options.maxTokens !== undefined
        ? { maxOutputTokens: resolveMaxTokens(options, requestOptions) }
        : {}),
    },
  };
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  if (schema) {
    body.generationConfig = {
      ...(body.generationConfig as Record<string, unknown>),
      responseMimeType: "application/json",
      responseSchema: zodToJsonSchema(schema),
    };
  }

  if (userTools.length) {
    body.tools = [{
      functionDeclarations: userTools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        parameters: tool.parameters,
      })),
    }];
    body.toolConfig = { functionCallingConfig: geminiToolConfig(requestOptions?.toolChoice) };
  }
  return body;
}

function usageFrom(value: unknown): TokenUsage | undefined {
  const usage = asRecord(value);
  if (!usage) return undefined;
  const inputTokens = asNumber(usage.promptTokenCount);
  const outputTokens = asNumber(usage.candidatesTokenCount);
  return compactUsage({
    inputTokens,
    outputTokens,
    totalTokens: totalTokens(inputTokens, outputTokens, asNumber(usage.totalTokenCount)),
    cachedInputTokens: asNumber(usage.cachedContentTokenCount),
    reasoningTokens: asNumber(usage.thoughtsTokenCount),
    raw: usage,
  });
}

function partsContent(partsValue: unknown, startIndex = 0): { text: string; toolCalls: ToolCall[] } {
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const [offset, partValue] of asArray(partsValue).entries()) {
    const part = asRecord(partValue);
    text += asString(part?.text) ?? "";
    const call = asRecord(part?.functionCall);
    if (call) {
      const name = asString(call.name) ?? `tool_${startIndex + offset}`;
      const argumentsText = JSON.stringify(call.args ?? {});
      const parsedCall = parseToolCall(
        asString(call.id) ?? `gemini-${startIndex + offset}-${name}`,
        name,
        argumentsText,
      );
      const thoughtSignature = asString(part?.thoughtSignature);
      toolCalls.push({
        ...parsedCall,
        ...(thoughtSignature ? { providerMetadata: { thoughtSignature } } : {}),
      });
    }
  }
  return { text, toolCalls };
}

function endpoint(options: ConductorOptions, requestOptions: RunOptions | undefined, streaming: boolean): string {
  const model = encodeURIComponent(resolveModel("gemini", options, requestOptions));
  const action = streaming ? "streamGenerateContent?alt=sse" : "generateContent";
  return joinURL(resolveBaseURL("gemini", options), `models/${model}:${action}`);
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  async chat(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny,
    requestOptions?: RunOptions,
  ): Promise<ProviderResponse> {
    const model = resolveModel("gemini", options, requestOptions);
    const { data, response } = await requestJson<Record<string, unknown>>({
      provider: "gemini",
      url: endpoint(options, requestOptions, false),
      init: {
        method: "POST",
        headers: mergeHeaders({
          "Content-Type": "application/json",
          "x-goog-api-key": options.apiKey ?? "",
        }, options, requestOptions),
        body: JSON.stringify(requestBody(messages, options, schema, requestOptions)),
      },
      options,
      requestOptions,
    });

    const candidate = asRecord(asArray(data.candidates)[0]);
    const contentRecord = asRecord(candidate?.content);
    if (!candidate || !contentRecord) {
      throw providerResponseError("gemini", "Gemini returned no candidate content.", data);
    }
    const parsed = partsContent(contentRecord.parts);

    return {
      content: parsed.text,
      raw: data,
      provider: "gemini",
      model: asString(data.modelVersion) ?? model,
      responseId: asString(data.responseId),
      requestId: responseRequestId(response),
      finishReason: asString(candidate.finishReason),
      usage: usageFrom(data.usageMetadata),
      ...(parsed.toolCalls.length ? { toolCalls: parsed.toolCalls } : {}),
    };
  }

  async *stream(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny,
    requestOptions?: RunOptions,
  ): AsyncIterable<ProviderStreamEvent> {
    const model = resolveModel("gemini", options, requestOptions);
    let content = "";
    let streamedModel = model;
    let responseId: string | undefined;
    let finishReason: string | undefined;
    let usage: TokenUsage | undefined;
    let raw: unknown;
    let sawData = false;
    const toolCalls: ToolCall[] = [];

    for await (const message of requestSSE({
      provider: "gemini",
      url: endpoint(options, requestOptions, true),
      init: {
        method: "POST",
        headers: mergeHeaders({
          "Content-Type": "application/json",
          "x-goog-api-key": options.apiKey ?? "",
        }, options, requestOptions),
        body: JSON.stringify(requestBody(messages, options, schema, requestOptions)),
      },
      options,
      requestOptions,
    })) {
      const event = parseStreamJson("gemini", message.data);
      assertNoStreamError("gemini", event);
      sawData = true;
      raw = event;
      streamedModel = asString(event.modelVersion) ?? streamedModel;
      responseId = asString(event.responseId) ?? responseId;
      const candidate = asRecord(asArray(event.candidates)[0]);
      finishReason = asString(candidate?.finishReason) ?? finishReason;
      const contentRecord = asRecord(candidate?.content);
      const parsed = partsContent(contentRecord?.parts, toolCalls.length);
      if (parsed.text) {
        content += parsed.text;
        yield { type: "text_delta", delta: parsed.text, raw: event };
      }
      for (const call of parsed.toolCalls) {
        const index = toolCalls.length;
        toolCalls.push(call);
        yield {
          type: "tool_call_delta",
          index,
          id: call.id,
          name: call.name,
          argumentsDelta: call.argumentsText ?? "",
          raw: event,
        };
      }
      const nextUsage = usageFrom(event.usageMetadata);
      if (nextUsage) {
        usage = nextUsage;
        yield { type: "usage", usage: nextUsage, raw: event };
      }
    }

    if (!sawData) {
      throw providerResponseError("gemini", "Gemini returned an empty stream.");
    }

    yield {
      type: "done",
      response: {
        content,
        raw,
        provider: "gemini",
        model: streamedModel,
        responseId,
        finishReason,
        usage,
        ...(toolCalls.length ? { toolCalls } : {}),
      },
    };
  }
}
