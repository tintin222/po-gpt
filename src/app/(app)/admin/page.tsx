import Link from "next/link";
import { ArrowRight, Cpu, MessagesSquare, Users, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/usage";
import { currentMonth, formatCost, formatTokens } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DefaultLimitForm } from "@/components/admin/default-limit-form";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const month = currentMonth();
  const [userCount, activeModels, totals, topUsers, settings, users] = await Promise.all([
    prisma.user.count(),
    prisma.llmModel.count({ where: { enabled: true, kind: "CHAT" } }),
    prisma.usageRecord.aggregate({
      where: { month },
      _sum: { inputTokens: true, outputTokens: true, estCostUsd: true },
      _count: true,
    }),
    prisma.usageRecord.groupBy({
      by: ["userId"],
      where: { month },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    getAppSettings(),
    prisma.user.findMany({ select: { id: true, name: true, monthlyTokenLimit: true } }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const totalTokens = (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0);
  const top = topUsers
    .map((r) => ({
      userId: r.userId,
      name: userById.get(r.userId)?.name ?? "(deleted)",
      tokens: (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0),
      limit: userById.get(r.userId)?.monthlyTokenLimit ?? settings.defaultMonthlyTokenLimit,
    }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 8);

  const stats = [
    { label: "Users", value: String(userCount), icon: Users, href: "/admin/users" },
    { label: "Active chat models", value: String(activeModels), icon: Cpu, href: "/admin/providers" },
    { label: `Tokens · ${month}`, value: formatTokens(totalTokens), icon: MessagesSquare, href: "/admin/usage" },
    { label: `Est. cost · ${month}`, value: formatCost(totals._sum.estCostUsd ?? 0), icon: Wallet, href: "/admin/usage" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="font-serif text-3xl font-medium tracking-tight">Admin overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform health, consumption, and governance at a glance.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <s.icon className="h-4 w-4 text-muted-foreground" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </div>
                  <div className="mt-3 text-2xl font-semibold">{s.value}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top consumers · {month}</CardTitle>
              <CardDescription>Token usage against each user&apos;s monthly budget.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {top.length === 0 && (
                <p className="text-sm text-muted-foreground">No usage recorded this month yet.</p>
              )}
              {top.map((u) => (
                <div key={u.userId}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTokens(u.tokens)}
                      {u.limit > 0 && <> / {formatTokens(u.limit)}</>}
                    </span>
                  </div>
                  <Progress value={u.limit > 0 ? (u.tokens / u.limit) * 100 : 0} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Global default limit</CardTitle>
              <CardDescription>
                Monthly token budget applied to users without an individual limit. Set 0 for
                unlimited.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DefaultLimitForm initialValue={settings.defaultMonthlyTokenLimit} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
