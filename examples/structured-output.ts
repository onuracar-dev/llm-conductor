import { Conductor } from "llm-conductor";
import { z } from "zod";

const Result = z.object({
  summary: z.string(),
  risks: z.array(z.string()),
});

const result = await new Conductor({
  provider: "gemini",
  apiKey: process.env.GEMINI_API_KEY ?? "",
  model: process.env.GEMINI_MODEL ?? "your-approved-model",
})
  .user("Summarize this deployment plan and list its risks.")
  .withSchema(Result)
  .run();

console.log(result.risks);
