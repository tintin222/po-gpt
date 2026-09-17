import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError, ApiError } from "@/lib/session";
import { encryptSecret } from "@/lib/crypto";
import type { ProviderType } from "@prisma/client";

const PROVIDER_TYPES: ProviderType[] = ["ANTHROPIC", "OPENAI", "GOOGLE", "LOCAL"];

export async function GET() {
  try {
    await requireAdmin();
    const providers = await prisma.provider.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        apiKeyHint: true,
        baseUrl: true,
        createdAt: true,
        models: { orderBy: { createdAt: "asc" } },
      },
    });
    return Response.json({ providers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as {
      name?: string;
      type?: string;
      apiKey?: string;
      baseUrl?: string;
    };

    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "") as ProviderType;
    const apiKey = String(body.apiKey ?? "").trim();
    const baseUrl = String(body.baseUrl ?? "").trim();

    if (!name) throw new ApiError(400, "Provider name is required");
    if (!PROVIDER_TYPES.includes(type)) throw new ApiError(400, "Invalid provider type");
    if (type !== "LOCAL" && !apiKey) throw new ApiError(400, "API key is required for this provider");
    if (type === "LOCAL" && !baseUrl) {
      throw new ApiError(400, "Base URL is required for local providers (e.g. http://ollama:11434/v1)");
    }
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
      throw new ApiError(400, "Base URL must start with http:// or https://");
    }

    const provider = await prisma.provider.create({
      data: {
        name: name.slice(0, 100),
        type,
        apiKeyEnc: apiKey ? encryptSecret(apiKey) : null,
        apiKeyHint: apiKey ? apiKey.slice(-4) : null,
        baseUrl: baseUrl || null,
      },
      select: { id: true },
    });
    return Response.json({ id: provider.id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
