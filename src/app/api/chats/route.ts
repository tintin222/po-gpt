import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, ApiError } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const chats = await prisma.chat.findMany({
      where: { userId: user.id, ...(projectId ? { projectId } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, projectId: true, updatedAt: true },
    });
    return Response.json({ chats });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string | null;
      modelId?: string | null;
    };

    let projectId: string | null = null;
    if (body.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: body.projectId, ownerId: user.id },
        select: { id: true },
      });
      if (!project) throw new ApiError(404, "Project not found");
      projectId = project.id;
    }

    let modelId: string | null = null;
    if (body.modelId) {
      const model = await prisma.llmModel.findFirst({
        where: { id: body.modelId, kind: "CHAT", enabled: true },
        select: { id: true },
      });
      modelId = model?.id ?? null;
    }

    const chat = await prisma.chat.create({
      data: { userId: user.id, projectId, modelId },
      select: { id: true },
    });
    return Response.json({ id: chat.id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
