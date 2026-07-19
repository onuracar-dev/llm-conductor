import { Conductor } from "llm-conductor";

const conductor = new Conductor({
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  model: process.env.ANTHROPIC_MODEL ?? "your-approved-model",
}).user("Write a two-sentence release announcement.");

for await (const event of conductor.stream()) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
  if (event.type === "done") console.log("\n", event.response.usage);
}
