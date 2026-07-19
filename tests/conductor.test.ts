import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  Conductor,
  ConductorError,
  DEFAULT_MODELS,
  type LLMProvider,
} from "../src";
import { asFetch, collectStream, jsonResponse, requestBody } from "./helpers";

describe("Conductor public API", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("preserves the fluent v1 API and exposes response metadata", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: "chatcmpl_123",
      model: "gpt-test",
      choices: [{ message: { content: "Hello!" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    }));

    const conductor = new Conductor({
      provider: "openai",
      apiKey: "test-key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    });
    const response = await conductor.system("Be concise.").user("Hello").run();

    expect(response).toBe("Hello!");
    expect(conductor.getHistory()).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hello!" },
    ]);
    expect(conductor.getLastResponse()).toMatchObject({
      content: "Hello!",
      provider: "openai",
      model: "gpt-test",
      responseId: "chatcmpl_123",
      finishReason: "stop",
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
    });
    expect(requestBody(fetchMock).model).toBe(DEFAULT_MODELS.openai);
  });

  it("returns typed structured output and normalizes malformed JSON", async () => {
    const Person = z.object({ name: z.string(), age: z.number().int() });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: '{"name":"Ada","age":36}' }, finish_reason: "stop" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "not-json" }, finish_reason: "stop" }],
      }));

    const conductor = new Conductor({
      provider: "openai",
      apiKey: "test-key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("Create a person").withSchema(Person);

    await expect(conductor.run()).resolves.toEqual({ name: "Ada", age: 36 });
    await expect(conductor.user("Again").run()).rejects.toMatchObject({
      name: "ConductorError",
      code: "VALIDATION_ERROR",
      provider: "openai",
    });
    expect(conductor.getHistory().at(-2)?.content).toContain("Ada");
    expect(conductor.getHistory().at(-1)).toEqual({ role: "user", content: "Again" });
  });

  it("normalizes Zod mismatches with issue details", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      choices: [{ message: { content: '{"age":"old"}' }, finish_reason: "stop" }],
    }));
    const conductor = new Conductor({
      provider: "openai",
      apiKey: "key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("age").withSchema(z.object({ age: z.number() }));

    await expect(conductor.run()).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { issues: expect.any(Array) },
    });
  });

  it("accepts a custom provider without requiring an API key", async () => {
    const adapter: LLMProvider = {
      name: "local-test-double",
      async chat(messages, options, _schema, runOptions) {
        return {
          content: `${messages[0]?.content}:${options.baseURL}:${runOptions?.model}`,
          raw: { local: true },
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      },
    };
    const conductor = new Conductor({ provider: adapter, baseURL: "http://localhost:9000" });
    const result = await conductor.user("ping").runWithMetadata({ model: "local-model" });

    expect(result).toMatchObject({
      content: "ping:http://localhost:9000:local-model",
      provider: "local-test-double",
      raw: { local: true },
    });
  });

  it("rejects streaming when a custom adapter has no stream implementation", async () => {
    const adapter: LLMProvider = {
      name: "non-streaming",
      async chat() {
        return { content: "ok", raw: {} };
      },
    };
    const conductor = new Conductor({ provider: adapter }).user("hello");

    await expect(collectStream(conductor.stream())).rejects.toMatchObject({
      code: "UNSUPPORTED_FEATURE",
      provider: "non-streaming",
    });
  });

  it("requires credentials only for built-in providers", () => {
    expect(() => new Conductor({ provider: "openai", apiKey: "" })).toThrowError(ConductorError);
    expect(() => new Conductor({
      provider: { chat: async () => ({ content: "ok", raw: null }) },
    })).not.toThrow();
  });

  it("protects history snapshots from array mutation", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "weather", arguments: '{"city":"Istanbul"}' },
          }],
        },
        finish_reason: "tool_calls",
      }],
    }));
    const conductor = new Conductor({
      provider: "openai",
      apiKey: "key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("weather").withTools([{ name: "weather" }]);
    await conductor.run();
    const snapshot = conductor.getHistory();
    snapshot.at(-1)?.toolCalls?.splice(0);
    expect(conductor.getHistory().at(-1)?.toolCalls).toHaveLength(1);
  });

  it("does not mix structured-output and tool-call operations", async () => {
    const conductor = new Conductor({
      provider: "openai",
      apiKey: "key",
      fetch: asFetch(fetchMock),
    }).user("hello").withSchema(z.object({ answer: z.string() }));

    await expect(conductor.run({ tools: [{ name: "lookup" }] })).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
