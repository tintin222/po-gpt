import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError, ApiError } from "@/lib/session";
import type { ModelKind } from "@prisma/client";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as {
      providerId?: string;
      modelKey?: string;
      displayName?: string;
      kind?: string;
      inputPricePerMTok?: number | null;
      outputPricePerMTok?: number | null;
    };

    const providerId = String(body.providerId ?? "");
    const modelKey = String(body.modelKey ?? "").trim();
    const displayName = String(body.displayName ?? "").trim() || modelKey;
    const kind = (body.kind === "EMBEDDING" ? "EMBEDDING" : "CHAT") as ModelKind;

    if (!providerId || !modelKey) {
      throw new ApiError(400, "Provider and model ID are required");
    }
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) throw new ApiError(404, "Provider not found");
    if (kind === "EMBEDDING" && provider.type === "ANTHROPIC") {
      throw new ApiError(400, "Anthropic does not offer an embeddings API — use OpenAI, Google, or a local model for embeddings");
    }

    const existing = await prisma.llmModel.findFirst({ where: { providerId, modelKey } });
    if (existing) throw new ApiError(409, "This model is already configured for this provider");

    const chatModelCount = await prisma.llmModel.count({ where: { kind: "CHAT" } });

    const model = await prisma.llmModel.create({
      data: {
        providerId,
        modelKey: modelKey.slice(0, 200),
        displayName: displayName.slice(0, 100),
        kind,
        inputPricePerMTok: numOrNull(body.inputPricePerMTok),
        outputPricePerMTok: numOrNull(body.outputPricePerMTok),
        // First chat model added becomes the default automatically.
        isDefault: kind === "CHAT" && chatModelCount === 0,
      },
      select: { id: true },
    });
    return Response.json({ id: model.id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
