import { z } from "zod";

export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  if (!schema) return {};
  if (typeof (schema as any).toJSONSchema === "function") {
    return (schema as any).toJSONSchema();
  }
  return {};
}
