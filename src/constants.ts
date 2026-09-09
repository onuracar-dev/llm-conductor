import type { BuiltInProvider } from "./types";

/**
 * Compatibility defaults preserve sensible out-of-the-box behavior.
 * Production applications should set `model` explicitly because providers can retire models.
 */
export const DEFAULT_MODELS: Readonly<Record<BuiltInProvider, string>> = Object.freeze({
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-20241022",
  gemini: "gemini-3.8-flash",
});

export const KNOWN_MODELS = Object.freeze({
  openai: [
    "gpt-6-astra",
    "gpt-4o",
    "gpt-4o-mini",
    "o3-mini",
    "o1",
    "gpt-4.5-preview",
  ],
  anthropic: [
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
  ],
  gemini: [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.1-pro-preview",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
  ],
  deepseek: [
    "deepseek-chat",
    "deepseek-reasoner",
  ],
});

export const DEFAULT_BASE_URLS: Readonly<Record<BuiltInProvider, string>> = Object.freeze({
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
});

export const DEFAULT_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_TOKENS = 65_536;
