import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Conductor } from "../src";
import { asFetch, jsonResponse, requestBody } from "./helpers";

describe("built-in provider parity", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("OpenAI supports gateway configuration, tools, usage, and tool results", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: "openai-1",
        model: "custom-model",
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call_weather",
              type: "function",
              function: { name: "weather", arguments: '{"city":"Istanbul"}' },
            }],
          },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
      }, 200, { "x-request-id": "header-id" }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "It is sunny." }, finish_reason: "stop" }],
      }));

    const conductor = new Conductor({
      provider: "openai",
      apiKey: "secret",
      model: "custom-model",
      baseURL: "https://gateway.example/v1/",
      headers: { "x-gateway": "yes" },
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("Check weather").withTools([{
      name: "weather",
      description: "Get weather",
      parameters: z.object({ city: z.string() }),
    }], { name: "weather" });

    const first = await conductor.runWithMetadata();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://gateway.example/v1/chat/completions");
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer secret");
    expect(headers.get("x-gateway")).toBe("yes");
    const firstBody = requestBody(fetchMock);
    expect(firstBody).toMatchObject({
      model: "custom-model",
      tool_choice: { type: "function", function: { name: "weather" } },
    });
    expect(first.toolCalls?.[0]).toMatchObject({
      id: "call_weather",
      name: "weather",
      arguments: { city: "Istanbul" },
    });

    conductor.toolResult(first.toolCalls![0]!, { temperature: 25 });
    await expect(conductor.run()).resolves.toBe("It is sunny.");
    const secondMessages = requestBody(fetchMock, 1).messages as Array<Record<string, unknown>>;
    expect(secondMessages.at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "call_weather",
      name: "weather",
      content: '{"temperature":25}',
    });
  });

  it("Anthropic maps system/history, tools, usage, and tool results", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: "msg_1",
        model: "claude-test",
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "toolu_1", name: "search", input: { q: "docs" } }],
        usage: { input_tokens: 8, output_tokens: 4, cache_read_input_tokens: 2 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "msg_2",
        content: [{ type: "text", text: "Found it." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 2 },
      }));

    const conductor = new Conductor({
      provider: "anthropic",
      apiKey: "secret",
      model: "claude-test",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).system("Be accurate").user("Find docs").withTools([{
      name: "search",
      parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    }], "required");

    const first = await conductor.runWithMetadata();
    const body = requestBody(fetchMock);
    expect(body.system).toBe("Be accurate");
    expect(body.tool_choice).toEqual({ type: "any" });
    expect(body.messages).toEqual([{
      role: "user",
      content: [{ type: "text", text: "Find docs" }],
    }]);
    expect(first).toMatchObject({
      responseId: "msg_1",
      usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, cachedInputTokens: 2 },
      toolCalls: [{ id: "toolu_1", name: "search", arguments: { q: "docs" } }],
    });

    conductor.tool(first.toolCalls![0]!, { hits: 1 });
    await conductor.run();
    const messages = requestBody(fetchMock, 1).messages as Array<Record<string, unknown>>;
    expect(messages.at(-1)).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: '{"hits":1}' }],
    });
  });

  it("Gemini merges consecutive turns and normalizes function calls and usage", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        candidates: [{
          content: { parts: [{
            thoughtSignature: "opaque-signature",
            functionCall: { id: "function-7", name: "lookup", args: { id: 7 } },
          }] },
          finishReason: "STOP",
        }],
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 2,
          totalTokenCount: 7,
          cachedContentTokenCount: 1,
        },
      }, 200, { "x-goog-request-id": "google-1" }))
      .mockResolvedValueOnce(jsonResponse({
        candidates: [{ content: { parts: [{ text: "Lookup complete" }] }, finishReason: "STOP" }],
      }));

    const conductor = new Conductor({
      provider: "gemini",
      apiKey: "secret",
      model: "gemini-test",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("Hello").user("World").withTools([{ name: "lookup" }]);
    const result = await conductor.runWithMetadata({ toolChoice: { name: "lookup" } });

    const body = requestBody(fetchMock);
    const contents = body.contents as Array<{ parts: Array<{ text?: string }> }>;
    expect(contents[0]?.parts[0]?.text).toBe("Hello\n\nWorld");
    expect(body.toolConfig).toEqual({
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["lookup"] },
    });
    expect(result).toMatchObject({
      requestId: "google-1",
      finishReason: "STOP",
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7, cachedInputTokens: 1 },
      toolCalls: [{
        id: "function-7",
        name: "lookup",
        arguments: { id: 7 },
        providerMetadata: { thoughtSignature: "opaque-signature" },
      }],
    });

    conductor.toolResult(result.toolCalls![0]!, { found: true });
    await conductor.run();
    const followupContents = requestBody(fetchMock, 1).contents as Array<{
      parts: Array<{ functionCall?: unknown; functionResponse?: unknown; thoughtSignature?: string }>;
    }>;
    expect(followupContents.at(-2)?.parts[0]).toMatchObject({
      thoughtSignature: "opaque-signature",
      functionCall: { id: "function-7", name: "lookup", args: { id: 7 } },
    });
    expect(followupContents.at(-1)?.parts[0]?.functionResponse).toEqual({
      id: "function-7",
      name: "lookup",
      response: { found: true },
    });
  });

  it.each([
    ["openai", {
      choices: [{ message: { content: '{"answer":42}' }, finish_reason: "stop" }],
    }],
    ["anthropic", {
      content: [{ type: "tool_use", id: "structured", name: "output_formatter", input: { answer: 42 } }],
      stop_reason: "tool_use",
    }],
    ["gemini", {
      candidates: [{ content: { parts: [{ text: '{"answer":42}' }] }, finishReason: "STOP" }],
    }],
  ] as const)("%s validates the same structured-output schema", async (provider, response) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(response));
    const conductor = new Conductor({
      provider,
      apiKey: "secret",
      model: "test-model",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("Answer").withSchema(z.object({ answer: z.number() }));

    await expect(conductor.run()).resolves.toEqual({ answer: 42 });
    const body = requestBody(fetchMock);
    if (provider === "openai") expect(body.response_format).toBeDefined();
    if (provider === "anthropic") expect(body.tool_choice).toEqual({ type: "tool", name: "output_formatter" });
    if (provider === "gemini") {
      expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json" });
    }
  });
});
