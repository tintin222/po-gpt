import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/usage";
import { currentMonth } from "@/lib/utils";
import { UsersManager } from "@/components/admin/users-manager";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const month = currentMonth();
  const [users, usage, settings] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        monthlyTokenLimit: true,
        createdAt: true,
      },
    }),
    prisma.usageRecord.groupBy({
      by: ["userId"],
      where: { month },
      _sum: { inputTokens: true, outputTokens: true, estCostUsd: true },
    }),
    getAppSettings(),
  ]);

  const usageByUser = new Map(
    usage.map((u) => [
      u.userId,
      {
        tokens: (u._sum.inputTokens ?? 0) + (u._sum.outputTokens ?? 0),
        cost: u._sum.estCostUsd ?? 0,
      },
    ])
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="font-serif text-3xl font-medium tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create accounts, assign roles, and set monthly token budgets. Current default budget:{" "}
          {settings.defaultMonthlyTokenLimit > 0
            ? `${settings.defaultMonthlyTokenLimit.toLocaleString()} tokens`
            : "unlimited"}
          .
        </p>
        <div className="mt-6">
          <UsersManager
            users={users.map((u) => ({
              ...u,
              createdAt: u.createdAt.toISOString(),
              monthTokens: usageByUser.get(u.id)?.tokens ?? 0,
              monthCostUsd: usageByUser.get(u.id)?.cost ?? 0,
            }))}
            defaultLimit={settings.defaultMonthlyTokenLimit}
          />
        </div>
      </div>
    </div>
  );
}
