import { z } from "zod";
import type { JsonSchema } from "../types";
import { configurationError } from "../errors";

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  if (!schema) return {};
  let converted: unknown;
  try {
    converted = z.toJSONSchema(schema);
  } catch (cause) {
    throw configurationError("The Zod schema cannot be represented as provider JSON Schema.", {
      cause,
    });
  }

  if (!converted || typeof converted !== "object" || Array.isArray(converted)) {
    throw configurationError("Zod returned an invalid JSON Schema object.");
  }
  // Provider APIs generally reject the draft declaration even though the schema itself is valid.
  const { $schema: _draft, ...providerSchema } = converted as JsonSchema;
  return providerSchema;
}
