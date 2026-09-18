import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/usage";
import { currentMonth, formatCost, formatTokens } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonthPicker } from "@/components/admin/month-picker";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? (monthParam as string) : currentMonth();

  const [totals, byUserRaw, byModelRaw, users, settings] = await Promise.all([
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
    getAppSettings(),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const totalTokens = (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0);

  const byUser = byUserRaw
    .map((r) => {
      const u = userById.get(r.userId);
      const tokens = (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0);
      const limit = u?.monthlyTokenLimit ?? settings.defaultMonthlyTokenLimit;
      return {
        userId: r.userId,
        name: u?.name ?? "(deleted user)",
        email: u?.email ?? "",
        tokens,
        input: r._sum.inputTokens ?? 0,
        output: r._sum.outputTokens ?? 0,
        cost: r._sum.estCostUsd ?? 0,
        requests: r._count,
        limit,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);

  const byModel = byModelRaw
    .map((r) => ({
      modelKey: r.modelKey,
      providerType: r.providerType,
      tokens: (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0),
      input: r._sum.inputTokens ?? 0,
      output: r._sum.outputTokens ?? 0,
      cost: r._sum.estCostUsd ?? 0,
      requests: r._count,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-medium tracking-tight">Usage</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Token consumption and estimated spend across the organization.
            </p>
          </div>
          <MonthPicker month={month} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total tokens", value: formatTokens(totalTokens) },
            { label: "Input tokens", value: formatTokens(totals._sum.inputTokens ?? 0) },
            { label: "Output tokens", value: formatTokens(totals._sum.outputTokens ?? 0) },
            { label: "Est. cost", value: formatCost(totals._sum.estCostUsd ?? 0) },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5">
                <div className="text-2xl font-semibold">{s.value}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>By user</CardTitle>
          </CardHeader>
          <CardContent>
            {byUser.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded in {month}.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="min-w-[160px]">Budget</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byUser.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell>
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {formatTokens(r.tokens)}
                          {r.limit > 0 ? ` / ${formatTokens(r.limit)}` : " · unlimited"}
                        </div>
                        {r.limit > 0 && (
                          <Progress value={(r.tokens / r.limit) * 100} className="mt-1" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">{r.requests}</TableCell>
                      <TableCell className="text-right">{formatTokens(r.input)}</TableCell>
                      <TableCell className="text-right">{formatTokens(r.output)}</TableCell>
                      <TableCell className="text-right">{formatCost(r.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>By model</CardTitle>
          </CardHeader>
          <CardContent>
            {byModel.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded in {month}.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byModel.map((r) => (
                    <TableRow key={`${r.providerType}-${r.modelKey}`}>
                      <TableCell className="font-medium">{r.modelKey}</TableCell>
                      <TableCell className="text-muted-foreground">{r.providerType}</TableCell>
                      <TableCell className="text-right">{r.requests}</TableCell>
                      <TableCell className="text-right">{formatTokens(r.input)}</TableCell>
                      <TableCell className="text-right">{formatTokens(r.output)}</TableCell>
                      <TableCell className="text-right">{formatCost(r.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
