# LLM Conductor

Type-safe orchestration for multi-provider LLM workflows.

<img src="./docs/assets/preview.svg" alt="LLM Conductor workflow preview">

LLM Conductor is a TypeScript library for AI features that need clean prompt composition, conversation history, provider switching, and structured output validation.

## Why This Exists

AI products often start with one provider call, then quickly grow into repeated infrastructure:

- prompt chains and system messages
- conversation state
- provider-specific request formats
- structured JSON response parsing
- Zod schemas for runtime safety

LLM Conductor turns that glue code into one fluent interface.

## Highlights

- Fluent `system().user().run()` workflow
- Provider abstraction for OpenAI, Anthropic, and Gemini
- Zod-backed structured output support
- TypeScript types for package consumers
- ESM, CJS, and declaration builds
- Vitest coverage for core conductor behavior

## Example

```ts
import { Conductor } from "llm-conductor";
import { z } from "zod";

const CandidateSchema = z.object({
  name: z.string(),
  role: z.string(),
  strengths: z.array(z.string()),
});

const conductor = new Conductor({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
});

const candidate = await conductor
  .system("You write concise engineering candidate summaries.")
  .user("Create a profile for a junior AI/full-stack developer.")
  .withSchema(CandidateSchema)
  .run();

console.log(candidate.strengths);
```

## Architecture

```text
Conductor
  -> message/history builder
  -> optional Zod schema conversion
  -> provider adapter
  -> model response
  -> parsed string or typed object
```

## Development

```bash
npm install
npm test
npm run build
```

## Current Status

This is an early library project with the core API, provider abstraction, tests, and build pipeline in place. The next strong improvements are streaming support, provider test doubles, and richer examples.

## Recent Hardening

Schema conversion now fails loudly when the installed Zod version cannot expose JSON Schema conversion, instead of silently returning an empty schema.

## Author

Onur Acar - <https://github.com/onuracar-dev>
