import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { effectiveTokenLimit } from "@/lib/usage";
import { currentMonth, formatCost, formatTokens } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const month = currentMonth();
  const [records, limit] = await Promise.all([
    prisma.usageRecord.findMany({ where: { userId: user.id, month } }),
    effectiveTokenLimit(user),
  ]);

  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const byModel = new Map<string, { input: number; output: number; requests: number }>();
  for (const r of records) {
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    cost += r.estCostUsd;
    const entry = byModel.get(r.modelKey) ?? { input: 0, output: 0, requests: 0 };
    entry.input += r.inputTokens;
    entry.output += r.outputTokens;
    entry.requests += 1;
    byModel.set(r.modelKey, entry);
  }
  const used = inputTokens + outputTokens;
  const pct = limit > 0 ? (used / limit) * 100 : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="font-serif text-3xl font-medium tracking-tight">My usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your consumption for {month}. Quotas reset at the start of each month.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Monthly token budget</CardTitle>
            <CardDescription>
              {limit > 0 ? (
                <>
                  {formatTokens(used)} of {formatTokens(limit)} tokens used
                </>
              ) : (
                <>{formatTokens(used)} tokens used — no limit set</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {limit > 0 && <Progress value={pct} />}
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Input tokens</div>
                <div className="mt-0.5 text-lg font-semibold">{formatTokens(inputTokens)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Output tokens</div>
                <div className="mt-0.5 text-lg font-semibold">{formatTokens(outputTokens)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Requests</div>
                <div className="mt-0.5 text-lg font-semibold">{records.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>By model</CardTitle>
            <CardDescription>Estimated cost this month: {formatCost(cost)}</CardDescription>
          </CardHeader>
          <CardContent>
            {byModel.size === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded this month.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(byModel.entries()).map(([modelKey, v]) => (
                    <TableRow key={modelKey}>
                      <TableCell className="font-medium">{modelKey}</TableCell>
                      <TableCell className="text-right">{v.requests}</TableCell>
                      <TableCell className="text-right">{formatTokens(v.input)}</TableCell>
                      <TableCell className="text-right">{formatTokens(v.output)}</TableCell>
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
