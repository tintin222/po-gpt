import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { currentMonth } from "@/lib/utils";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") ?? "")
      ? (url.searchParams.get("month") as string)
      : currentMonth();

    const [totals, byUserRaw, byModelRaw, users] = await Promise.all([
      prisma.usageRecord.aggregate({
        where: { month },
        _sum: { inputTokens: true, outputTokens: true, estCostUsd: true },
        _count: true,
      }),
      prisma.usageRecord.groupBy({
        by: ["userId"],
        where: { month },
        _sum: { inputTokens: true, outputTokens: true, estCostUsd: true },
        _count: true,
      }),
      prisma.usageRecord.groupBy({
        by: ["modelKey", "providerType"],
        where: { month },
        _sum: { inputTokens: true, outputTokens: true, estCostUsd: true },
        _count: true,
      }),
      prisma.user.findMany({
        select: { id: true, name: true, email: true, monthlyTokenLimit: true },
      }),
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));

    const byUser = byUserRaw
      .map((r) => ({
        userId: r.userId,
        name: userById.get(r.userId)?.name ?? "(deleted user)",
        email: userById.get(r.userId)?.email ?? "",
        monthlyTokenLimit: userById.get(r.userId)?.monthlyTokenLimit ?? null,
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        tokens: (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0),
        estCostUsd: r._sum.estCostUsd ?? 0,
        requests: r._count,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    const byModel = byModelRaw
      .map((r) => ({
        modelKey: r.modelKey,
        providerType: r.providerType,
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        tokens: (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0),
        estCostUsd: r._sum.estCostUsd ?? 0,
        requests: r._count,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    return Response.json({
      month,
      totals: {
        inputTokens: totals._sum.inputTokens ?? 0,
        outputTokens: totals._sum.outputTokens ?? 0,
        tokens: (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0),
        estCostUsd: totals._sum.estCostUsd ?? 0,
        requests: totals._count,
      },
      byUser,
      byModel,
    });
  } catch (error) {
    return jsonError(error);
  }
}
