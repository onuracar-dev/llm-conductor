# Changelog

This project follows Semantic Versioning.

## 1.1.0 - 2026-07-19

### Added

- Normalized streaming for OpenAI, Anthropic, and Gemini.
- Provider-parity tool calls and tool-result continuation.
- Response metadata including usage, identifiers, finish reasons, and raw provider data.
- `runWithMetadata`, `stream`, `withTools`, `toolResult`, and `getLastResponse` APIs.
- Custom adapters plus injectable `fetch`, base URL, headers, and per-request model options.
- Normalized `ConductorError` values.
- Timeout, caller `AbortSignal`, exponential backoff, jitter, and `Retry-After` handling.
- Provider-focused mock coverage, integration examples, security policy, CI, and product website.

### Changed

- Package output now exposes verified ESM, CommonJS, and declaration entry points.
- Compatibility default models are explicit through `DEFAULT_MODELS`; production callers should select a model explicitly.
- Abandoned streaming response bodies are cancelled.

## 1.0.0

- Initial fluent multi-provider prompt adapter.
