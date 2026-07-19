import { Conductor, type LLMProvider } from "llm-conductor";

const provider: LLMProvider = {
  name: "internal-gateway",
  async chat(messages, options, _schema, requestOptions) {
    const response = await fetch(`${options.baseURL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model: requestOptions?.model ?? options.model }),
      signal: requestOptions?.signal,
    });
    const raw = await response.json() as { answer: string };
    return { content: raw.answer, raw };
  },
};

const answer = await new Conductor({
  provider,
  baseURL: "http://localhost:8080",
  model: "local-model",
}).user("Hello").run();

console.log(answer);
