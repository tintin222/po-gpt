import { prisma } from "@/lib/prisma";
import { currentMonth } from "@/lib/utils";
import type { User } from "@prisma/client";

export async function getAppSettings() {
  const existing = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

/** Effective monthly token limit for a user. 0 = unlimited. */
export async function effectiveTokenLimit(user: User): Promise<number> {
  if (user.monthlyTokenLimit !== null && user.monthlyTokenLimit !== undefined) {
    return user.monthlyTokenLimit;
  }
  const settings = await getAppSettings();
  return settings.defaultMonthlyTokenLimit;
}

/** Total tokens (input + output) consumed by a user in a given month. */
export async function monthlyTokensUsed(userId: string, month = currentMonth()): Promise<number> {
  const agg = await prisma.usageRecord.aggregate({
    where: { userId, month },
    _sum: { inputTokens: true, outputTokens: true },
  });
  return (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
}

export interface QuotaStatus {
  used: number;
  limit: number; // 0 = unlimited
  exceeded: boolean;
}

export async function getQuotaStatus(user: User): Promise<QuotaStatus> {
  const [used, limit] = await Promise.all([
    monthlyTokensUsed(user.id),
    effectiveTokenLimit(user),
  ]);
  return { used, limit, exceeded: limit > 0 && used >= limit };
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  inputPricePerMTok?: number | null,
  outputPricePerMTok?: number | null
): number {
  const inCost = ((inputPricePerMTok ?? 0) * inputTokens) / 1_000_000;
  const outCost = ((outputPricePerMTok ?? 0) * outputTokens) / 1_000_000;
  return inCost + outCost;
}

export async function recordUsage(params: {
  userId: string;
  chatId?: string;
  modelKey: string;
  providerType: string;
  inputTokens: number;
  outputTokens: number;
  inputPricePerMTok?: number | null;
  outputPricePerMTok?: number | null;
}): Promise<void> {
  const { userId, chatId, modelKey, providerType, inputTokens, outputTokens } = params;
  await prisma.usageRecord.create({
    data: {
      userId,
      chatId,
      modelKey,
      providerType,
      inputTokens,
      outputTokens,
      estCostUsd: estimateCost(
        inputTokens,
        outputTokens,
        params.inputPricePerMTok,
        params.outputPricePerMTok
      ),
      month: currentMonth(),
    },
  });
}
