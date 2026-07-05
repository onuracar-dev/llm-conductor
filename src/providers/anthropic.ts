import { LLMProvider, ConductorOptions, Message, ProviderResponse } from "../types";
import { zodToJsonSchema } from "../utils/schema";
import { z } from "zod";

export class AnthropicProvider implements LLMProvider {
  async chat(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny
  ): Promise<ProviderResponse> {
    const model = options.model || "claude-3-5-sonnet-20240620";
    const temperature = options.temperature ?? 0.7;

    const systemMessages = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const chatMessagesRaw = messages.filter((m) => m.role !== "system");

    // Anthropic requires strictly alternating user/assistant messages.
    // Merge consecutive messages of the same role.
    const chatMessages = chatMessagesRaw.reduce((acc, curr) => {
      const last = acc[acc.length - 1];
      if (last && last.role === curr.role) {
        last.content += "\n\n" + curr.content;
      } else {
        acc.push({ role: curr.role, content: curr.content });
      }
      return acc;
    }, [] as Message[]);

    const body: any = {
      model,
      max_tokens: 4096,
      temperature,
      messages: chatMessages,
    };

    if (systemMessages) {
      body.system = systemMessages;
    }

    if (schema) {
      body.tools = [
        {
          name: "output_formatter",
          description: "Formats the output according to the schema",
          input_schema: zodToJsonSchema(schema),
        },
      ];
      body.tool_choice = { type: "tool", name: "output_formatter" };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    let content = "";
    
    if (schema) {
      const toolCall = data.content?.find((c: any) => c.type === "tool_use" && c.name === "output_formatter");
      content = toolCall ? toolCall.input : {};
    } else {
      content = data.content?.[0]?.text || "";
    }

    return {
      content,
      raw: data,
    };
  }
}
