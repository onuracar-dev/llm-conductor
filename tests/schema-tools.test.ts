import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConductorError, normalizeTools, parseToolCall, zodToJsonSchema } from "../src";

describe("schema and tool edge cases", () => {
  it("converts Zod to provider-friendly JSON Schema", () => {
    const schema = zodToJsonSchema(z.object({ id: z.number().int(), tags: z.array(z.string()) }));
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        id: { type: "integer" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id", "tags"],
    });
    expect(schema).not.toHaveProperty("$schema");
  });

  it("rejects invalid and duplicate tool names", () => {
    expect(() => normalizeTools([{ name: "contains spaces" }])).toThrowError(ConductorError);
    expect(() => normalizeTools([{ name: "same" }, { name: "same" }])).toThrowError(
      /Duplicate tool name/,
    );
  });

  it("preserves malformed tool arguments for explicit caller handling", () => {
    expect(parseToolCall("1", "broken", "{nope")).toEqual({
      id: "1",
      name: "broken",
      arguments: "{nope",
      argumentsText: "{nope",
    });
  });
});
