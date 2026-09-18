import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, ApiError } from "@/lib/session";
import { extractText, isSupportedFile } from "@/lib/extract";

export const maxDuration = 300;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_FILES_PER_UPLOAD = 5;
const MAX_ATTACHMENTS_PER_CHAT = 20;
const MAX_CONTENT_CHARS = 80_000; // per file, injected into model context

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const chat = await prisma.chat.findFirst({ where: { id, userId: user.id } });
    if (!chat) throw new ApiError(404, "Chat not found");

    const existing = await prisma.chatAttachment.count({ where: { chatId: id } });

    const formData = await req.formData();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new ApiError(400, "No files provided");
    if (files.length > MAX_FILES_PER_UPLOAD) {
      throw new ApiError(400, `At most ${MAX_FILES_PER_UPLOAD} files per message`);
    }
    if (existing + files.length > MAX_ATTACHMENTS_PER_CHAT) {
      throw new ApiError(400, `A chat can hold at most ${MAX_ATTACHMENTS_PER_CHAT} attachments`);
    }

    const created: Array<{ id: string; name: string; sizeBytes: number }> = [];
    for (const file of files) {
      const name = file.name || "untitled";
      const mimeType = file.type || "application/octet-stream";
      if (file.size > MAX_FILE_BYTES) throw new ApiError(400, `"${name}" is larger than 20 MB`);
      if (!isSupportedFile(name, mimeType)) {
        throw new ApiError(
          400,
          `"${name}" is not a supported file type (PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, JSON, and code files are supported)`
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      let content: string;
      try {
        content = await extractText(name, mimeType, buffer);
      } catch (e) {
        throw new ApiError(
          400,
          `Could not read "${name}": ${e instanceof Error ? e.message : "extraction failed"}`
        );
      }
      if (!content.trim()) {
        throw new ApiError(400, `No readable text found in "${name}"`);
      }
      if (content.length > MAX_CONTENT_CHARS) {
        content = `${content.slice(0, MAX_CONTENT_CHARS)}\n… (file truncated for context)`;
      }

      const attachment = await prisma.chatAttachment.create({
        data: {
          chatId: id,
          name: name.slice(0, 200),
          mimeType,
          sizeBytes: file.size,
          content,
        },
        select: { id: true, name: true, sizeBytes: true },
      });
      created.push(attachment);
    }

    return Response.json({ attachments: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
