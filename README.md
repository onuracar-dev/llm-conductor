# LLM Conductor

Type-safe orchestration for multi-provider LLM workflows.

LLM Conductor is a small TypeScript library for building AI flows that need provider switching, conversation history, and structured outputs without rewriting the same glue code for every model API.

## Why It Exists

AI apps often start simple, then quickly need the same patterns again and again:

- keep `system`, `user`, and `assistant` messages in order
- switch between OpenAI, Anthropic, and Gemini
- ask for structured JSON and validate it safely
- keep the calling code readable as prompts grow

LLM Conductor wraps those concerns in one fluent interface.

## Highlights

- Provider-oriented architecture for OpenAI, Anthropic, and Gemini
- Fluent prompt builder for system and user messages
- Conversation history management
- Zod-backed structured output support
- TypeScript-first package with ESM, CJS, and declaration builds

## Install

```bash
npm install llm-conductor zod
```

## Example

```ts
import { Conductor } from "llm-conductor";
import { z } from "zod";

const ProfileSchema = z.object({
  name: z.string(),
  role: z.string(),
  strengths: z.array(z.string()),
});

const conductor = new Conductor({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
});

const profile = await conductor
  .system("You create concise candidate profiles.")
  .user("Create a profile for a junior full-stack developer.")
  .withSchema(ProfileSchema)
  .run();

console.log(profile.strengths);
```

## Project Status

This is an early portfolio/library project. The core API, provider abstraction, tests, and build pipeline are in place; the next valuable improvements are broader provider test doubles, streaming support, and more examples.

## Development

```bash
npm install
npm test
npm run build
```

## Recent Hardening

Schema conversion now fails loudly when the installed Zod version cannot expose JSON Schema conversion, instead of silently returning an empty schema.

## License

MIT
