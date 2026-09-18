import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, ApiError } from "@/lib/session";
import { isSupportedFile } from "@/lib/extract";
import { processDocument } from "@/lib/rag";

export const maxDuration = 300;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_FILES_PER_UPLOAD = 10;

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
    const documents = await prisma.document.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true } } },
    });
    return Response.json({ documents });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await ownedProject(user.id, id);

    const formData = await req.formData();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new ApiError(400, "No files provided");
    if (files.length > MAX_FILES_PER_UPLOAD) {
      throw new ApiError(400, `At most ${MAX_FILES_PER_UPLOAD} files per upload`);
    }

    const created: Array<{ id: string; name: string }> = [];
    for (const file of files) {
      const name = file.name || "untitled";
      const mimeType = file.type || "application/octet-stream";
      if (file.size > MAX_FILE_BYTES) {
        throw new ApiError(400, `"${name}" is larger than 20 MB`);
      }
      if (!isSupportedFile(name, mimeType)) {
        throw new ApiError(
          400,
          `"${name}" is not a supported file type (PDF, DOCX, XLSX, TXT, MD, CSV, JSON, and code files are supported)`
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const doc = await prisma.document.create({
        data: {
          projectId: id,
          name: name.slice(0, 200),
          mimeType,
          sizeBytes: file.size,
          status: "PROCESSING",
        },
        select: { id: true, name: true },
      });
      created.push(doc);

      // Process (extract → chunk → embed) in the background; the client polls.
      processDocument(doc.id, buffer).catch((e) =>
        console.error(`[documents] processing failed for ${doc.id}:`, e)
      );
    }

    return Response.json({ documents: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
