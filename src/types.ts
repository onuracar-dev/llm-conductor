import { z } from "zod";

export type Role = "system" | "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface ConductorOptions {
  provider: "openai" | "anthropic" | "gemini";
  apiKey: string;
  model?: string;
  temperature?: number;
}

export interface ProviderResponse<T = any> {
  content: T;
  raw: any;
}

export interface LLMProvider {
  chat(
    messages: Message[],
    options: ConductorOptions,
    schema?: z.ZodTypeAny
  ): Promise<ProviderResponse>;
}
