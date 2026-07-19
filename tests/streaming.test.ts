import { describe, expect, it, vi } from "vitest";
import { Conductor } from "../src";
import { asFetch, collectStream, sseResponse } from "./helpers";

describe("normalized provider streaming", () => {
  it("streams OpenAI text, tool arguments, usage, and a final response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      { data: { id: "stream-1", model: "gpt-test", choices: [{ delta: { content: "Hi " } }] } },
      { data: { id: "stream-1", model: "gpt-test", choices: [{ delta: { content: "there" } }] } },
      { data: {
        id: "stream-1",
        model: "gpt-test",
        choices: [{ delta: { tool_calls: [{
          index: 0,
          id: "call_1",
          function: { name: "lookup", arguments: '{"id":' },
        }] } }],
      } },
      { data: {
        id: "stream-1",
        model: "gpt-test",
        choices: [{
          delta: { tool_calls: [{ index: 0, function: { arguments: "7}" } }] },
          finish_reason: "tool_calls",
        }],
      } },
      { data: { choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } } },
      { data: "[DONE]" },
    ]));
    const conductor = new Conductor({
      provider: "openai",
      apiKey: "key",
      model: "gpt-test",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("hello").withTools([{ name: "lookup" }]);

    const events = await collectStream(conductor.stream());
    expect(events.flatMap((event) => event.type === "text_delta" ? [event.delta] : [])).toEqual([
      "Hi ",
      "there",
    ]);
    const done = events.at(-1);
    expect(done).toMatchObject({
      type: "done",
      response: {
        content: "Hi there",
        usage: { totalTokens: 5 },
        toolCalls: [{ id: "call_1", name: "lookup", arguments: { id: 7 } }],
      },
    });
    expect(conductor.getHistory().at(-1)).toMatchObject({
      role: "assistant",
      content: "Hi there",
      toolCalls: [{ id: "call_1" }],
    });
  });

  it("streams Anthropic text and preserves aggregate usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      {
        event: "message_start",
        data: {
          type: "message_start",
          message: { id: "msg_stream", model: "claude-test", usage: { input_tokens: 6, output_tokens: 0 } },
        },
      },
      {
        event: "content_block_start",
        data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      },
      {
        event: "content_block_delta",
        data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
      },
      {
        event: "message_delta",
        data: {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { output_tokens: 2 },
        },
      },
      { event: "message_stop", data: { type: "message_stop" } },
    ]));
    const conductor = new Conductor({
      provider: "anthropic",
      apiKey: "key",
      model: "claude-test",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("hello");

    const events = await collectStream(conductor.stream());
    expect(events.at(-1)).toMatchObject({
      type: "done",
      response: {
        content: "Hello",
        responseId: "msg_stream",
        usage: { inputTokens: 6, outputTokens: 2, totalTokens: 8 },
      },
    });
  });

  it("streams Gemini text/function calls and a final response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      { data: {
        candidates: [{ content: { parts: [{ text: "A" }] } }],
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1, totalTokenCount: 3 },
      } },
      { data: {
        candidates: [{
          content: { parts: [{ text: "B" }, { functionCall: { name: "search", args: { q: "x" } } }] },
          finishReason: "STOP",
        }],
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 },
      } },
    ]));
    const conductor = new Conductor({
      provider: "gemini",
      apiKey: "key",
      model: "gemini-test",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("hello").withTools([{ name: "search" }]);

    const events = await collectStream(conductor.stream());
    expect(events.at(-1)).toMatchObject({
      type: "done",
      response: {
        content: "AB",
        finishReason: "STOP",
        usage: { totalTokens: 5 },
        toolCalls: [{ name: "search", arguments: { q: "x" } }],
      },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(":streamGenerateContent?alt=sse");
  });

  it("rejects malformed SSE payloads with a stream error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ data: "{broken" }]));
    const conductor = new Conductor({
      provider: "openai",
      apiKey: "key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("hello");

    await expect(collectStream(conductor.stream())).rejects.toMatchObject({
      code: "STREAM_ERROR",
      provider: "openai",
    });
  });

  it("surfaces Anthropic in-stream error events", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([{
      event: "error",
      data: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
    }]));
    const conductor = new Conductor({
      provider: "anthropic",
      apiKey: "key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("hello");

    await expect(collectStream(conductor.stream())).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      provider: "anthropic",
      message: "Overloaded",
    });
  });

  it("cancels the response body when a caller stops consuming early", async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"choices":[{"delta":{"content":"first"}}]}\n\n',
        ));
      },
      cancel,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    const conductor = new Conductor({
      provider: "openai",
      apiKey: "key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("hello");

    const iterator = conductor.stream()[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "text_delta", delta: "first" },
      done: false,
    });
    await iterator.return?.();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
