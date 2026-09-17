/**
 * Suggested models per provider type (client-safe — no server imports).
 * Prices are USD per 1M tokens, editable by admins after adding.
 */
export type CatalogEntry = {
  modelKey: string;
  displayName: string;
  kind: "CHAT" | "EMBEDDING";
  inputPricePerMTok?: number;
  outputPricePerMTok?: number;
};

export const MODEL_CATALOG: Record<string, CatalogEntry[]> = {
  ANTHROPIC: [
    { modelKey: "claude-opus-5", displayName: "Claude Opus 5", kind: "CHAT", inputPricePerMTok: 5, outputPricePerMTok: 25 },
    { modelKey: "claude-sonnet-5", displayName: "Claude Sonnet 5", kind: "CHAT", inputPricePerMTok: 2, outputPricePerMTok: 10 },
    { modelKey: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", kind: "CHAT", inputPricePerMTok: 3, outputPricePerMTok: 15 },
    { modelKey: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", kind: "CHAT", inputPricePerMTok: 1, outputPricePerMTok: 5 },
  ],
  OPENAI: [
    { modelKey: "gpt-5", displayName: "GPT-5", kind: "CHAT", inputPricePerMTok: 1.25, outputPricePerMTok: 10 },
    { modelKey: "gpt-5-mini", displayName: "GPT-5 mini", kind: "CHAT", inputPricePerMTok: 0.25, outputPricePerMTok: 2 },
    { modelKey: "gpt-4o", displayName: "GPT-4o", kind: "CHAT", inputPricePerMTok: 2.5, outputPricePerMTok: 10 },
    { modelKey: "text-embedding-3-small", displayName: "Text Embedding 3 Small", kind: "EMBEDDING", inputPricePerMTok: 0.02 },
  ],
  GOOGLE: [
    { modelKey: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", kind: "CHAT", inputPricePerMTok: 1.25, outputPricePerMTok: 10 },
    { modelKey: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", kind: "CHAT", inputPricePerMTok: 0.3, outputPricePerMTok: 2.5 },
    { modelKey: "gemini-embedding-001", displayName: "Gemini Embedding 001", kind: "EMBEDDING" },
  ],
  LOCAL: [],
};

export const PROVIDER_LABELS: Record<string, string> = {
  ANTHROPIC: "Anthropic",
  OPENAI: "OpenAI",
  GOOGLE: "Google Gemini",
  LOCAL: "Local (OpenAI-compatible)",
};
