# Contributing

Thanks for helping improve LLM Conductor.

## Before opening a change

Open an issue for breaking API changes or a new provider. Small fixes and additional mock fixtures can go directly to a pull request.

Keep the portability boundary narrow:

- preserve the fluent v1 API unless a major release is planned;
- normalize portable behavior while retaining provider-native data in `raw`;
- avoid runtime dependencies when the platform API is sufficient;
- never include real API keys, customer prompts, or provider responses in tests;
- document provider-specific limitations rather than implying unsupported parity.

## Local setup

```bash
npm ci
npm run check
npm pack --dry-run
npm audit
```

Tests must use deterministic HTTP/SSE mocks. Live provider tests are not part of the default suite because they are costly, nondeterministic, and require secrets.

## Pull requests

Include:

- a focused description of the behavior change;
- tests for success and error paths;
- documentation for public APIs;
- a note about backward compatibility;
- sanitized provider fixtures when request or response mapping changes.

Use conventional, imperative commit subjects where practical, such as `feat: normalize Gemini usage metadata`.
