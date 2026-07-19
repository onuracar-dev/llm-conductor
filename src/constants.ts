import type { BuiltInProvider } from "./types";

/**
 * Compatibility defaults preserve the original v1 constructor behavior.
 * Production applications should set `model` explicitly because providers can retire models.
 */
export const DEFAULT_MODELS: Readonly<Record<BuiltInProvider, string>> = Object.freeze({
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-20240620",
  gemini: "gemini-1.5-flash",
});

export const DEFAULT_BASE_URLS: Readonly<Record<BuiltInProvider, string>> = Object.freeze({
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
});

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_TOKENS = 4_096;
