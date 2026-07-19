import { describe, expect, it, vi } from "vitest";
import { Conductor, ConductorError, type FetchLike } from "../src";
import { asFetch, jsonResponse } from "./helpers";

describe("request resilience and normalized errors", () => {
  it("retries transient HTTP failures and honors a zero Retry-After", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(
        { error: { message: "slow down" } },
        429,
        { "retry-after": "0", "x-request-id": "rate-1" },
      ))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      }));
    const conductor = new Conductor({
      provider: "openai",
      apiKey: "key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0, jitter: false },
    }).user("hello");

    await expect(conductor.run()).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication failures and retains provider details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(
      { error: { message: "invalid key", type: "authentication_error" } },
      401,
      { "x-request-id": "auth-1" },
    ));
    const conductor = new Conductor({
      provider: "openai",
      apiKey: "bad-key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 3, initialDelayMs: 0 },
    }).user("hello");

    const error = await conductor.run().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConductorError);
    expect(error).toMatchObject({
      code: "AUTHENTICATION_ERROR",
      status: 401,
      retryable: false,
      requestId: "auth-1",
      details: { error: { message: "invalid key" } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes per-attempt timeouts", async () => {
    const neverCompletes: FetchLike = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const abort = () => reject(signal?.reason ?? new Error("aborted"));
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
    const conductor = new Conductor({
      provider: "openai",
      apiKey: "key",
      fetch: neverCompletes,
      timeoutMs: 5,
      retry: { maxRetries: 0 },
    }).user("hello");

    await expect(conductor.run()).rejects.toMatchObject({
      code: "TIMEOUT",
      provider: "openai",
      retryable: true,
    });
  });

  it("distinguishes caller cancellation from timeout", async () => {
    const controller = new AbortController();
    controller.abort("stop-now");
    const abortedFetch: FetchLike = async (_input, init) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      throw new Error("expected an aborted signal");
    };
    const conductor = new Conductor({
      provider: "gemini",
      apiKey: "key",
      fetch: abortedFetch,
      retry: { maxRetries: 2, initialDelayMs: 0 },
    }).user("hello");

    await expect(conductor.run({ signal: controller.signal })).rejects.toMatchObject({
      code: "ABORTED",
      provider: "gemini",
      retryable: false,
    });
  });

  it("normalizes malformed successful responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not JSON", { status: 200 }));
    const conductor = new Conductor({
      provider: "anthropic",
      apiKey: "key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 0 },
    }).user("hello");

    await expect(conductor.run()).rejects.toMatchObject({
      code: "PROVIDER_RESPONSE_ERROR",
      provider: "anthropic",
    });
  });

  it("normalizes network exceptions after retry exhaustion", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("socket closed"));
    const conductor = new Conductor({
      provider: "gemini",
      apiKey: "key",
      fetch: asFetch(fetchMock),
      retry: { maxRetries: 1, initialDelayMs: 0, maxDelayMs: 0 },
    }).user("hello");

    await expect(conductor.run()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      provider: "gemini",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
