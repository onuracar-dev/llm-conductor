export interface GeminiModelInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportsReasoning?: boolean;
}

export const CURATED_GEMINI_MODELS: GeminiModelInfo[] = [
  {
    id: "gemini-3.8-flash",
    name: "models/gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash (Latest)",
    description: "Latest flagship model. Dynamic thinking, autonomous agents & coding.",
    supportsReasoning: true,
  },
  {
    id: "gemini-3.7-flash",
    name: "models/gemini-3.7-flash",
    displayName: "Gemini 3.7 Flash",
    description: "Fast reasoning & hybrid thinking developer workhorse.",
    supportsReasoning: true,
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "models/gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro (Preview)",
    description: "Complex reasoning, deep logic, and architectural coding.",
    supportsReasoning: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "models/gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "High speed, low latency multimodal reasoning.",
    supportsReasoning: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "models/gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    description: "High capacity stable model.",
    supportsReasoning: true,
  },
];

export async function fetchLiveGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error("Gemini API key is required to scan models.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const message = errorJson?.error?.message || `Google API error ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  const rawList: any[] = data.models || [];

  return rawList
    .filter(
      (m) =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes("generateContent")
    )
    .map((m) => {
      const id = m.name ? m.name.replace(/^models\//, "") : "";
      return {
        id,
        name: m.name || id,
        displayName: m.displayName || id,
        description: m.description || "",
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit,
        supportsReasoning:
          id.includes("3.") || id.includes("flash") || id.includes("pro"),
      };
    })
    .filter(
      (m) =>
        m.id &&
        !m.id.includes("embedding") &&
        !m.id.includes("aqa") &&
        !m.id.includes("imagen") &&
        !m.id.includes("veo")
    );
}
