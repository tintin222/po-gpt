import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError, ApiError } from "@/lib/session";
import { encryptSecret } from "@/lib/crypto";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new ApiError(404, "Provider not found");

    const body = (await req.json()) as { name?: string; apiKey?: string; baseUrl?: string };
    const data: Record<string, string | null> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim().slice(0, 100);
    }
    if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      const key = body.apiKey.trim();
      data.apiKeyEnc = encryptSecret(key);
      data.apiKeyHint = key.slice(-4);
    }
    if (typeof body.baseUrl === "string") {
      const baseUrl = body.baseUrl.trim();
      if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
        throw new ApiError(400, "Base URL must start with http:// or https://");
      }
      data.baseUrl = baseUrl || null;
    }

    await prisma.provider.update({ where: { id }, data });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new ApiError(404, "Provider not found");
    await prisma.provider.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
