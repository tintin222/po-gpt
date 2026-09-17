import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, ApiError } from "@/lib/session";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const doc = await prisma.document.findFirst({
      where: { id, project: { ownerId: user.id } },
    });
    if (!doc) throw new ApiError(404, "Document not found");

    await prisma.document.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
