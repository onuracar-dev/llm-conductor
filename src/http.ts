import { DEFAULT_TIMEOUT_MS } from "./constants";
import { ConductorError, isConductorError } from "./errors";
import type {
  BuiltInProvider,
  ConductorOptions,
  FetchLike,
  RetryOptions,
  RunOptions,
} from "./types";

const DEFAULT_RETRYABLE_STATUSES = [408, 409, 425, 429, 500, 502, 503, 504] as const;

interface ResolvedRetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableStatusCodes: readonly number[];
}

interface RequestContext {
  provider: BuiltInProvider | string;
  url: string;
  init: RequestInit;
  options: ConductorOptions;
  requestOptions?: RunOptions;
}

export interface JsonHttpResult<T> {
  data: T;
  response: Response;
}

export interface SSEMessage {
  event?: string;
  data: string;
}

function finiteNonNegative(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new ConductorError(`${label} must be a finite, non-negative number.`, {
      code: "CONFIGURATION_ERROR",
    });
  }
  return resolved;
}

function resolveRetryOptions(
  base: RetryOptions | undefined,
  override: RetryOptions | undefined,
): ResolvedRetryOptions {
  const merged = { ...base, ...override };
  return {
    maxRetries: Math.floor(finiteNonNegative(merged.maxRetries, 2, "maxRetries")),
    initialDelayMs: finiteNonNegative(merged.initialDelayMs, 250, "initialDelayMs"),
    maxDelayMs: finiteNonNegative(merged.maxDelayMs, 4_000, "maxDelayMs"),
    backoffMultiplier: finiteNonNegative(merged.backoffMultiplier, 2, "backoffMultiplier"),
    jitter: merged.jitter ?? true,
    retryableStatusCodes: merged.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUSES,
  };
}

function resolveFetch(options: ConductorOptions): FetchLike {
  if (options.fetch) return options.fetch;
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
  throw new ConductorError(
    "No fetch implementation is available. Pass `fetch` in Conductor options.",
    { code: "CONFIGURATION_ERROR" },
  );
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

function requestIdFrom(response: Response): string | undefined {
  return response.headers?.get("x-request-id")
    ?? response.headers?.get("request-id")
    ?? response.headers?.get("x-goog-request-id")
    ?? undefined;
}

async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === "string") return body.slice(0, 1_000);
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    if (record.error && typeof record.error === "object") {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
    }
  }
  return fallback;
}

function errorCodeForStatus(status: number): ConductorError["code"] {
  if (status === 401) return "AUTHENTICATION_ERROR";
  if (status === 403) return "PERMISSION_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "PROVIDER_ERROR";
  return "REQUEST_ERROR";
}

async function httpError(
  provider: BuiltInProvider | string,
  response: Response,
  retryableStatuses: readonly number[],
): Promise<ConductorError> {
  const details = await readErrorBody(response);
  const fallback = `${provider} request failed with HTTP ${response.status}.`;
  return new ConductorError(extractMessage(details, fallback), {
    code: errorCodeForStatus(response.status),
    provider,
    status: response.status,
    retryable: retryableStatuses.includes(response.status),
    retryAfterMs: parseRetryAfter(response.headers?.get("retry-after") ?? null),
    requestId: requestIdFrom(response),
    details,
  });
}

interface AttemptSignal {
  signal: AbortSignal;
  cleanup: () => void;
  timedOut: () => boolean;
}

function createAttemptSignal(external: AbortSignal | undefined, timeoutMs: number): AttemptSignal {
  const controller = new AbortController();
  let timeoutTriggered = false;
  const abortFromExternal = () => controller.abort(external?.reason);

  if (external?.aborted) {
    controller.abort(external.reason);
  } else {
    external?.addEventListener("abort", abortFromExternal, { once: true });
  }

  const timer = timeoutMs > 0
    ? setTimeout(() => {
        timeoutTriggered = true;
        controller.abort(new Error(`Request timed out after ${timeoutMs}ms.`));
      }, timeoutMs)
    : undefined;

  return {
    signal: controller.signal,
    timedOut: () => timeoutTriggered,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      external?.removeEventListener("abort", abortFromExternal);
    },
  };
}

function normalizeThrownError(
  error: unknown,
  provider: BuiltInProvider | string,
  signal: AttemptSignal,
  external: AbortSignal | undefined,
): ConductorError {
  if (isConductorError(error)) return error;
  if (signal.timedOut()) {
    return new ConductorError("The provider request timed out.", {
      code: "TIMEOUT",
      provider,
      retryable: true,
      cause: error,
    });
  }
  if (external?.aborted) {
    return new ConductorError("The provider request was aborted.", {
      code: "ABORTED",
      provider,
      cause: error,
    });
  }
  return new ConductorError(
    error instanceof Error ? error.message : "The provider request failed before receiving a response.",
    {
      code: "NETWORK_ERROR",
      provider,
      retryable: true,
      cause: error,
    },
  );
}

function retryDelay(error: ConductorError, attempt: number, options: ResolvedRetryOptions): number {
  if (error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, options.maxDelayMs);
  }
  const exponential = Math.min(
    options.initialDelayMs * options.backoffMultiplier ** attempt,
    options.maxDelayMs,
  );
  return options.jitter ? Math.random() * exponential : exponential;
}

async function waitForRetry(
  milliseconds: number,
  signal: AbortSignal | undefined,
  provider: BuiltInProvider | string,
): Promise<void> {
  if (signal?.aborted) {
    throw new ConductorError("The provider request was aborted.", { code: "ABORTED", provider });
  }
  if (milliseconds <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const onComplete = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(onComplete, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new ConductorError("The provider request was aborted.", { code: "ABORTED", provider }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function openResponse(context: RequestContext): Promise<{
  response: Response;
  attemptSignal: AttemptSignal;
}> {
  const retry = resolveRetryOptions(context.options.retry, context.requestOptions?.retry);
  const timeoutMs = finiteNonNegative(
    context.requestOptions?.timeoutMs ?? context.options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    "timeoutMs",
  );
  const fetchImplementation = resolveFetch(context.options);

  for (let attempt = 0; ; attempt += 1) {
    const attemptSignal = createAttemptSignal(context.requestOptions?.signal, timeoutMs);
    try {
      const response = await fetchImplementation(context.url, {
        ...context.init,
        signal: attemptSignal.signal,
      });
      if (response.ok) return { response, attemptSignal };

      const error = await httpError(context.provider, response, retry.retryableStatusCodes);
      attemptSignal.cleanup();
      if (!error.retryable || attempt >= retry.maxRetries) throw error;
      await waitForRetry(
        retryDelay(error, attempt, retry),
        context.requestOptions?.signal,
        context.provider,
      );
    } catch (thrown) {
      const error = normalizeThrownError(
        thrown,
        context.provider,
        attemptSignal,
        context.requestOptions?.signal,
      );
      attemptSignal.cleanup();
      if (!error.retryable || attempt >= retry.maxRetries) throw error;
      await waitForRetry(
        retryDelay(error, attempt, retry),
        context.requestOptions?.signal,
        context.provider,
      );
    }
  }
}

export async function requestJson<T>(context: RequestContext): Promise<JsonHttpResult<T>> {
  const { response, attemptSignal } = await openResponse(context);
  try {
    let data: T;
    try {
      data = await response.json() as T;
    } catch (cause) {
      if (attemptSignal.timedOut()) {
        throw new ConductorError("The provider request timed out while reading its response.", {
          code: "TIMEOUT",
          provider: context.provider,
          retryable: false,
          cause,
        });
      }
      if (context.requestOptions?.signal?.aborted) {
        throw new ConductorError("The provider request was aborted while reading its response.", {
          code: "ABORTED",
          provider: context.provider,
          cause,
        });
      }
      throw new ConductorError("The provider returned a non-JSON response.", {
        code: "PROVIDER_RESPONSE_ERROR",
        provider: context.provider,
        status: response.status,
        requestId: requestIdFrom(response),
        cause,
      });
    }
    return { data, response };
  } finally {
    attemptSignal.cleanup();
  }
}

async function* decodeSSE(response: Response): AsyncGenerator<SSEMessage> {
  if (!response.body) {
    throw new ConductorError("The provider returned an empty streaming body.", {
      code: "STREAM_ERROR",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const parseBlock = (block: string): SSEMessage | undefined => {
    let event: string | undefined;
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      let value = separator === -1 ? "" : line.slice(separator + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      if (field === "data") data.push(value);
    }
    return data.length ? { event, data: data.join("\n") } : undefined;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const parsed = parseBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (parsed) yield parsed;
        boundary = buffer.indexOf("\n\n");
      }
      if (done) {
        completed = true;
        break;
      }
    }
    if (buffer.trim()) {
      const parsed = parseBlock(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function* requestSSE(context: RequestContext): AsyncGenerator<SSEMessage> {
  const { response, attemptSignal } = await openResponse(context);
  try {
    yield* decodeSSE(response);
  } catch (error) {
    if (isConductorError(error)) throw error;
    if (attemptSignal.timedOut()) {
      throw new ConductorError("The provider stream timed out.", {
        code: "TIMEOUT",
        provider: context.provider,
        retryable: false,
        cause: error,
      });
    }
    if (context.requestOptions?.signal?.aborted) {
      throw new ConductorError("The provider stream was aborted.", {
        code: "ABORTED",
        provider: context.provider,
        cause: error,
      });
    }
    throw new ConductorError("The provider stream terminated unexpectedly.", {
      code: "STREAM_ERROR",
      provider: context.provider,
      cause: error,
    });
  } finally {
    attemptSignal.cleanup();
  }
}

export function joinURL(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function responseRequestId(response: Response): string | undefined {
  return requestIdFrom(response);
}
