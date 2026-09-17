import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModel, LanguageModel } from "ai";
import type { LlmModel, Provider, ProviderType } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/session";

export type ModelWithProvider = LlmModel & { provider: Provider };

function apiKeyFor(provider: Provider): string | undefined {
  if (!provider.apiKeyEnc) return undefined;
  return decryptSecret(provider.apiKeyEnc);
}

/** Instantiate an AI SDK language model for a DB-configured model row. */
export function languageModelFor(model: ModelWithProvider): LanguageModel {
  const { provider } = model;
  const apiKey = apiKeyFor(provider);

  switch (provider.type) {
    case "ANTHROPIC": {
      if (!apiKey) throw new ApiError(500, `Provider "${provider.name}" has no API key configured`);
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model.modelKey);
    }
    case "OPENAI": {
      if (!apiKey) throw new ApiError(500, `Provider "${provider.name}" has no API key configured`);
      const openai = createOpenAI({ apiKey, ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}) });
      return openai(model.modelKey);
    }
    case "GOOGLE": {
      if (!apiKey) throw new ApiError(500, `Provider "${provider.name}" has no API key configured`);
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model.modelKey);
    }
    case "LOCAL": {
      if (!provider.baseUrl) {
        throw new ApiError(500, `Local provider "${provider.name}" has no base URL configured`);
      }
      const local = createOpenAICompatible({
        name: provider.name,
        baseURL: provider.baseUrl,
        apiKey: apiKey ?? "not-needed",
      });
      return local.chatModel(model.modelKey);
    }
  }
}

/** Instantiate an AI SDK embedding model for a DB-configured model row. */
export function embeddingModelFor(model: ModelWithProvider): EmbeddingModel<string> {
  const { provider } = model;
  const apiKey = apiKeyFor(provider);

  switch (provider.type) {
    case "OPENAI": {
      if (!apiKey) throw new ApiError(500, `Provider "${provider.name}" has no API key configured`);
      const openai = createOpenAI({ apiKey, ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}) });
      return openai.textEmbeddingModel(model.modelKey);
    }
    case "GOOGLE": {
      if (!apiKey) throw new ApiError(500, `Provider "${provider.name}" has no API key configured`);
      const google = createGoogleGenerativeAI({ apiKey });
      return google.textEmbeddingModel(model.modelKey);
    }
    case "LOCAL": {
      if (!provider.baseUrl) {
        throw new ApiError(500, `Local provider "${provider.name}" has no base URL configured`);
      }
      const local = createOpenAICompatible({
        name: provider.name,
        baseURL: provider.baseUrl,
        apiKey: apiKey ?? "not-needed",
      });
      return local.textEmbeddingModel(model.modelKey);
    }
    case "ANTHROPIC":
      throw new ApiError(400, "Anthropic does not offer an embeddings API");
  }
}

/** The configured embedding model, if any (first enabled EMBEDDING model). */
export async function getEmbeddingModel(): Promise<ModelWithProvider | null> {
  return prisma.llmModel.findFirst({
    where: { kind: "EMBEDDING", enabled: true, provider: { type: { not: "ANTHROPIC" } } },
    include: { provider: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Resolve the chat model to use for a request:
 * explicit selection → chat's saved model → global default → first enabled.
 */
export async function resolveChatModel(
  requestedModelId: string | null | undefined,
  chatModelId: string | null | undefined
): Promise<ModelWithProvider> {
  if (requestedModelId) {
    const m = await prisma.llmModel.findFirst({
      where: { id: requestedModelId, kind: "CHAT", enabled: true },
      include: { provider: true },
    });
    if (m) return m;
  }
  if (chatModelId) {
    const m = await prisma.llmModel.findFirst({
      where: { id: chatModelId, kind: "CHAT", enabled: true },
      include: { provider: true },
    });
    if (m) return m;
  }
  const fallback = await prisma.llmModel.findFirst({
    where: { kind: "CHAT", enabled: true },
    include: { provider: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (!fallback) {
    throw new ApiError(
      400,
      "No chat model is configured. Ask an administrator to add an LLM provider and model.",
      "NO_MODEL"
    );
  }
  return fallback;
}

export { MODEL_CATALOG, PROVIDER_LABELS } from "@/lib/catalog";
