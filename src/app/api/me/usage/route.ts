import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/session";
import { effectiveTokenLimit } from "@/lib/usage";
import { currentMonth } from "@/lib/utils";

export async function GET() {
  try {
    const user = await requireUser();
    const month = currentMonth();

    const records = await prisma.usageRecord.findMany({
      where: { userId: user.id, month },
      orderBy: { createdAt: "asc" },
    });

    const limit = await effectiveTokenLimit(user);
    let inputTokens = 0;
    let outputTokens = 0;
    let estCostUsd = 0;
    const byModel = new Map<string, { inputTokens: number; outputTokens: number; count: number }>();

    for (const r of records) {
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      estCostUsd += r.estCostUsd;
      const key = r.modelKey;
      const entry = byModel.get(key) ?? { inputTokens: 0, outputTokens: 0, count: 0 };
      entry.inputTokens += r.inputTokens;
      entry.outputTokens += r.outputTokens;
      entry.count += 1;
      byModel.set(key, entry);
    }

    return Response.json({
      month,
      limit,
      used: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      estCostUsd,
      requests: records.length,
      byModel: Array.from(byModel.entries()).map(([modelKey, v]) => ({ modelKey, ...v })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
