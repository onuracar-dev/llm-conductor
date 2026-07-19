import { z } from "zod";
import { configurationError } from "../errors";
import type { JsonSchema, ToolCall, ToolDefinition } from "../types";
import { zodToJsonSchema } from "./schema";

export interface NormalizedToolDefinition {
  name: string;
  description?: string;
  parameters: JsonSchema;
}

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return Boolean(
    value
      && typeof value === "object"
      && "safeParse" in value
      && typeof (value as { safeParse?: unknown }).safeParse === "function",
  );
}

export function normalizeTools(tools: readonly ToolDefinition[] = []): NormalizedToolDefinition[] {
  const seen = new Set<string>();

  return tools.map((tool) => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(tool.name)) {
      throw configurationError(
        `Invalid tool name "${tool.name}". Use 1-64 letters, numbers, underscores, or hyphens.`,
      );
    }
    if (seen.has(tool.name)) {
      throw configurationError(`Duplicate tool name: ${tool.name}`);
    }
    seen.add(tool.name);

    const convertedParameters = tool.parameters
      ? isZodSchema(tool.parameters)
        ? zodToJsonSchema(tool.parameters)
        : tool.parameters
      : { type: "object", properties: {}, additionalProperties: false };
    const { $schema: _draft, ...parameters } = convertedParameters;

    return {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      parameters,
    };
  });
}

export function parseToolCall(
  id: string,
  name: string,
  argumentsText: string,
): ToolCall {
  let parsed: unknown = {};
  if (argumentsText.trim()) {
    try {
      parsed = JSON.parse(argumentsText);
    } catch {
      parsed = argumentsText;
    }
  }

  return {
    id,
    name,
    arguments: parsed,
    argumentsText,
  };
}
