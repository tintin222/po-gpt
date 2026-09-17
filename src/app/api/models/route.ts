import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/session";

/** Enabled chat models available to end users (for the model dropdown). */
export async function GET() {
  try {
    await requireUser();
    const models = await prisma.llmModel.findMany({
      where: { kind: "CHAT", enabled: true },
      include: { provider: { select: { name: true, type: true } } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return Response.json({
      models: models.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        modelKey: m.modelKey,
        isDefault: m.isDefault,
        providerName: m.provider.name,
        providerType: m.provider.type,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
