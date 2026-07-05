import { LLMProvider, ConductorOptions, Message, ProviderResponse } from "../types";
import { zodToJsonSchema } from "../utils/schema";
import { z } from "zod";

export class GeminiProvider implements LLMProvider {
  async chat(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny
  ): Promise<ProviderResponse> {
    const model = options.model || "gemini-1.5-flash";
    const temperature = options.temperature ?? 0.7;

    const systemMessages = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const chatMessagesRaw = messages.filter((m) => m.role !== "system");

    const chatMessages = chatMessagesRaw.reduce((acc, curr) => {
      const role = curr.role === "assistant" ? "model" : "user";
      const last = acc[acc.length - 1];
      if (last && last.role === role) {
        last.parts[0].text += "\n\n" + curr.content;
      } else {
        acc.push({ role, parts: [{ text: curr.content }] });
      }
      return acc;
    }, [] as any[]);
    const body: any = {
      contents: chatMessages,
      generationConfig: {
        temperature,
      }
    };

    if (systemMessages) {
      body.systemInstruction = {
        parts: [{ text: systemMessages }]
      };
    }

    if (schema) {
      body.generationConfig.responseMimeType = "application/json";
      body.generationConfig.responseSchema = zodToJsonSchema(schema);
    }

    const encodedModel = encodeURIComponent(model);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": options.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsedContent = content;
    if (schema) {
      try {
        parsedContent = JSON.parse(content);
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
