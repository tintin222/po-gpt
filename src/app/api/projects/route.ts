import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, ApiError } from "@/lib/session";

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await prisma.project.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { chats: true, documents: true } } },
    });
    return Response.json({ projects });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { name?: string; description?: string };
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError(400, "Project name is required");

    const project = await prisma.project.create({
      data: {
        ownerId: user.id,
        name: name.slice(0, 120),
        description: String(body.description ?? "").slice(0, 500),
      },
      select: { id: true },
    });
    return Response.json({ id: project.id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
