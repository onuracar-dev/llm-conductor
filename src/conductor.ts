import { z } from "zod";
import { ConductorOptions, Message, LLMProvider } from "./types";
import { OpenAIProvider, AnthropicProvider, GeminiProvider } from "./providers";

export class Conductor<T = string> {
  private history: Message[] = [];
  private schema?: z.ZodType<T>;
  private providerInstance: LLMProvider;

  constructor(private options: ConductorOptions) {
    if (!options.apiKey || typeof options.apiKey !== "string") {
      throw new Error("API Key is required and must be a string.");
    }

    if (options.provider === "openai") {
      this.providerInstance = new OpenAIProvider();
    } else if (options.provider === "anthropic") {
      this.providerInstance = new AnthropicProvider();
    } else if (options.provider === "gemini") {
      this.providerInstance = new GeminiProvider();
    } else {
      throw new Error(`Unsupported provider: ${options.provider}`);
    }
  }

  system(content: string): this {
    this.history.push({ role: "system", content });
    return this;
  }

  user(content: string): this {
    this.history.push({ role: "user", content });
    return this;
  }

  assistant(content: string): this {
    this.history.push({ role: "assistant", content });
    return this;
  }

  withSchema<USchema extends z.ZodTypeAny>(schema: USchema): Conductor<z.infer<USchema>> {
    this.schema = schema as any;
    return this as unknown as Conductor<z.infer<USchema>>;
  }

  async run(): Promise<T> {
    const response = await this.providerInstance.chat(this.history, this.options, this.schema);
    
    let result = response.content;

    if (this.schema) {
      // Validate the parsed json through zod
      result = this.schema.parse(result);
    }

    // Add assistant's response to history automatically
    this.history.push({ 
      role: "assistant", 
      content: typeof result === "string" ? result : JSON.stringify(result) 
    });

    return result as T;
  }

  getHistory(): Message[] {
    return [...this.history];
  }

  clearHistory(): this {
    this.history = [];
    return this;
  }
}
