import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError, ApiError } from "@/lib/session";
import { currentMonth } from "@/lib/utils";

export async function GET() {
  try {
    await requireAdmin();
    const month = currentMonth();
    const [users, usage] = await Promise.all([
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
          _count: { select: { chats: true } },
        },
      }),
      prisma.usageRecord.groupBy({
        by: ["userId"],
        where: { month },
        _sum: { inputTokens: true, outputTokens: true, estCostUsd: true },
      }),
    ]);

    const usageByUser = new Map(
      usage.map((u) => [
        u.userId,
        {
          tokens: (u._sum.inputTokens ?? 0) + (u._sum.outputTokens ?? 0),
          estCostUsd: u._sum.estCostUsd ?? 0,
        },
      ])
    );

    return Response.json({
      users: users.map((u) => ({
        ...u,
        monthTokens: usageByUser.get(u.id)?.tokens ?? 0,
        monthCostUsd: usageByUser.get(u.id)?.estCostUsd ?? 0,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      monthlyTokenLimit?: number | null;
    };

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";

    if (!name || !email || !/.+@.+\..+/.test(email)) {
      throw new ApiError(400, "A valid name and email are required");
    }
    if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, "A user with this email already exists");

    const user = await prisma.user.create({
      data: {
        name: name.slice(0, 100),
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role,
        monthlyTokenLimit: limitOrNull(body.monthlyTokenLimit),
      },
      select: { id: true },
    });
    return Response.json({ id: user.id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

function limitOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
