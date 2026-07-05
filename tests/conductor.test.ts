import { describe, it, expect, vi, beforeEach } from "vitest";
import { Conductor } from "../src/conductor";
import { z } from "zod";

// Mock the global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Conductor Builder Pattern", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("should chain system and user messages correctly and manage history", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Merhaba, nasıl yardımcı olabilirim?" } }],
      }),
    } as any);

    const bot = new Conductor({
      provider: "openai",
      apiKey: "test-api-key",
    });

    bot.system("Sen bir asistansın.").user("Merhaba");

    expect(bot.getHistory()).toHaveLength(2);
    expect(bot.getHistory()[0]).toEqual({ role: "system", content: "Sen bir asistansın." });
    
    const response = await bot.run();
    expect(response).toBe("Merhaba, nasıl yardımcı olabilirim?");
    
    // Check if assistant response was added to history
    expect(bot.getHistory()).toHaveLength(3);
    expect(bot.getHistory()[2]).toEqual({ role: "assistant", content: "Merhaba, nasıl yardımcı olabilirim?" });
  });

  it("should validate and return JSON using zod schema", async () => {
    const mockUserResponse = {
      name: "John Doe",
      age: 30,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockUserResponse) } }],
      }),
    } as any);

    const UserSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const bot = new Conductor({
      provider: "openai",
      apiKey: "test-api-key",
    });

    const result = await bot
      .user("Bana rastgele bir kullanıcı profili oluştur.")
      .withSchema(UserSchema)
      .run();

    // Result should be fully typed and parsed
    expect(result.name).toBe("John Doe");
    expect(result.age).toBe(30);

    // Ensure the fetch was called with response_format json_schema
    const callArgs = mockFetch.mock.calls[0];
    const fetchOptions = callArgs[1];
    const body = JSON.parse(fetchOptions.body as string);
    
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.schema.type).toBe("object");
  });

  it("should merge consecutive user messages for Gemini to avoid 400 errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Gemini Response" }] } }],
      }),
    } as any);

    const bot = new Conductor({
      provider: "gemini",
      apiKey: "test-api-key",
    });

    await bot.user("Hello").user("World").run();

    const callArgs = mockFetch.mock.calls[0];
    const fetchOptions = callArgs[1];
    const body = JSON.parse(fetchOptions.body as string);
    
    // Gemini should only receive 1 user message with merged content
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].parts[0].text).toBe("Hello\n\nWorld");
  });
});
