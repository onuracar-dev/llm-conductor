import { z } from "zod";

export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  if (!schema) return {};
  if (typeof (z as any).toJSONSchema === "function") {
    return (z as any).toJSONSchema(schema);
  }
  if (typeof (schema as any).toJSONSchema === "function") {
    return (schema as any).toJSONSchema();
  }
  throw new Error("This Zod version does not expose JSON Schema conversion.");
}
