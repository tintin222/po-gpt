import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError, ApiError } from "@/lib/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const model = await prisma.llmModel.findUnique({ where: { id } });
    if (!model) throw new ApiError(404, "Model not found");

    const body = (await req.json()) as {
      displayName?: string;
      enabled?: boolean;
      isDefault?: boolean;
      toolsEnabled?: boolean;
      inputPricePerMTok?: number | null;
      outputPricePerMTok?: number | null;
    };

    if (body.isDefault === true && model.kind === "CHAT") {
      await prisma.$transaction([
        prisma.llmModel.updateMany({ where: { kind: "CHAT" }, data: { isDefault: false } }),
        prisma.llmModel.update({ where: { id }, data: { isDefault: true, enabled: true } }),
      ]);
    }

    const data: Record<string, unknown> = {};
    if (typeof body.displayName === "string" && body.displayName.trim()) {
      data.displayName = body.displayName.trim().slice(0, 100);
    }
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (typeof body.toolsEnabled === "boolean") data.toolsEnabled = body.toolsEnabled;
    if ("inputPricePerMTok" in body) data.inputPricePerMTok = numOrNull(body.inputPricePerMTok);
    if ("outputPricePerMTok" in body) data.outputPricePerMTok = numOrNull(body.outputPricePerMTok);

    if (Object.keys(data).length > 0) {
      await prisma.llmModel.update({ where: { id }, data });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const model = await prisma.llmModel.findUnique({ where: { id } });
    if (!model) throw new ApiError(404, "Model not found");
    await prisma.llmModel.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
