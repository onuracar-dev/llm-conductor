import { Conductor } from "llm-conductor";

const conductor = new Conductor({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY ?? "",
  model: process.env.OPENAI_MODEL ?? "your-approved-model",
});

const response = await conductor
  .system("Be concise and explicit about uncertainty.")
  .user("What makes an API idempotent?")
  .runWithMetadata();

console.log(response.content);
console.log(response.usage);
