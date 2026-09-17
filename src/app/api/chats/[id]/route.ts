import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, ApiError } from "@/lib/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const chat = await prisma.chat.findFirst({ where: { id, userId: user.id } });
    if (!chat) throw new ApiError(404, "Chat not found");

    const body = (await req.json()) as { title?: string };
    const title = String(body.title ?? "").trim();
    if (!title) throw new ApiError(400, "Title is required");

    await prisma.chat.update({ where: { id }, data: { title: title.slice(0, 120) } });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const chat = await prisma.chat.findFirst({ where: { id, userId: user.id } });
    if (!chat) throw new ApiError(404, "Chat not found");

    await prisma.chat.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
