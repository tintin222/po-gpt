import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, ApiError } from "@/lib/session";

async function ownedProject(userId: string, id: string) {
  const project = await prisma.project.findFirst({ where: { id, ownerId: userId } });
  if (!project) throw new ApiError(404, "Project not found");
  return project;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownedProject(user.id, id);
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: "desc" } },
        _count: { select: { chats: true } },
      },
    });
    return Response.json({ project });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownedProject(user.id, id);

    const body = (await req.json()) as {
      name?: string;
      description?: string;
      instructions?: string;
      memory?: string;
    };

    const data: Record<string, string> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
    if (typeof body.description === "string") data.description = body.description.slice(0, 500);
    if (typeof body.instructions === "string") data.instructions = body.instructions.slice(0, 20_000);
    if (typeof body.memory === "string") data.memory = body.memory.slice(0, 20_000);

    await prisma.project.update({ where: { id }, data });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownedProject(user.id, id);
    await prisma.project.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
