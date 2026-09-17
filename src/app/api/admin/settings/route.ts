import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError, ApiError } from "@/lib/session";
import { getAppSettings } from "@/lib/usage";

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getAppSettings();
    return Response.json({ settings });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as { defaultMonthlyTokenLimit?: number | string };

    const n =
      typeof body.defaultMonthlyTokenLimit === "string"
        ? parseInt(body.defaultMonthlyTokenLimit, 10)
        : body.defaultMonthlyTokenLimit;
    if (!Number.isFinite(n) || (n as number) < 0) {
      throw new ApiError(400, "Default monthly token limit must be a non-negative number (0 = unlimited)");
    }

    await getAppSettings();
    const settings = await prisma.appSettings.update({
      where: { id: 1 },
      data: { defaultMonthlyTokenLimit: Math.floor(n as number) },
    });
    return Response.json({ settings });
  } catch (error) {
    return jsonError(error);
  }
}
