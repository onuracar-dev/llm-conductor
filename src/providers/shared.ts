import { DEFAULT_BASE_URLS, DEFAULT_MAX_TOKENS, DEFAULT_MODELS } from "../constants";
import { ConductorError } from "../errors";
import type {
  BuiltInProvider,
  ConductorOptions,
  RunOptions,
  TokenUsage,
} from "../types";

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function resolveModel(
  provider: BuiltInProvider,
  options: ConductorOptions,
  requestOptions?: RunOptions,
): string {
  return requestOptions?.model ?? options.model ?? DEFAULT_MODELS[provider];
}

export function resolveTemperature(options: ConductorOptions, requestOptions?: RunOptions): number {
  return requestOptions?.temperature ?? options.temperature ?? 0.7;
}

export function resolveMaxTokens(options: ConductorOptions, requestOptions?: RunOptions): number {
  return requestOptions?.maxTokens ?? options.maxTokens ?? DEFAULT_MAX_TOKENS;
}

export function resolveBaseURL(provider: BuiltInProvider, options: ConductorOptions): string {
  return options.baseURL ?? DEFAULT_BASE_URLS[provider];
}

export function mergeHeaders(
  defaults: Record<string, string>,
  options: ConductorOptions,
  requestOptions?: RunOptions,
): Record<string, string> {
  return {
    ...defaults,
    ...options.headers,
    ...requestOptions?.headers,
  };
}

export function parseStreamJson(provider: BuiltInProvider, data: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(data);
    const record = asRecord(parsed);
    if (!record) throw new Error("SSE data is not an object.");
    return record;
  } catch (cause) {
    throw new ConductorError(`${provider} returned malformed streaming JSON.`, {
      code: "STREAM_ERROR",
      provider,
      details: data.slice(0, 1_000),
      cause,
    });
  }
}

export function assertNoStreamError(
  provider: BuiltInProvider,
  event: Record<string, unknown>,
): void {
  const error = asRecord(event.error);
  if (event.type !== "error" && !error) return;
  const message = asString(error?.message) ?? `${provider} reported an error while streaming.`;
  throw new ConductorError(message, {
    code: "PROVIDER_ERROR",
    provider,
    retryable: false,
    details: event,
  });
}

export function totalTokens(inputTokens?: number, outputTokens?: number, reported?: number): number | undefined {
  return reported ?? (
    inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined
  );
}

export function compactUsage(usage: TokenUsage): TokenUsage | undefined {
  const hasValue = Object.entries(usage).some(([key, value]) => key !== "raw" && value !== undefined);
  return hasValue || usage.raw !== undefined ? usage : undefined;
}
