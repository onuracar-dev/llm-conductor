import { LLMProvider, ConductorOptions, Message, ProviderResponse } from "../types";
import { zodToJsonSchema } from "../utils/schema";
import { z } from "zod";

export class OpenAIProvider implements LLMProvider {
  async chat(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny
  ): Promise<ProviderResponse> {
    const model = options.model || "gpt-4o";
    const temperature = options.temperature ?? 0.7;

    const body: any = {
      model,
      messages,
      temperature,
    };

    if (schema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: "output_schema",
          strict: true,
          schema: zodToJsonSchema(schema),
        },
      };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsedContent = content;
    if (schema) {
      try {
        parsedContent = JSON.parse(content);
        // validate via zod (handled by Conductor later, or we can do it here)
      } catch (e) {
        // failed to parse
      }
    }

    return {
      content: parsedContent,
      raw: data,
    };
  }
}
