import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, ApiError } from "@/lib/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const file = await prisma.generatedFile.findFirst({
      where: { id, userId: user.id },
    });
    if (!file) throw new ApiError(404, "File not found");

    const encodedName = encodeURIComponent(file.name).replace(/['()]/g, escape);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.sizeBytes),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
