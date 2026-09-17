import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError, ApiError } from "@/lib/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, "User not found");

    const body = (await req.json()) as {
      name?: string;
      role?: string;
      active?: boolean;
      monthlyTokenLimit?: number | null | string;
      password?: string;
    };

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 100);
    if (body.role === "ADMIN" || body.role === "USER") {
      if (id === admin.id && body.role !== "ADMIN") {
        throw new ApiError(400, "You cannot remove your own admin role");
      }
      data.role = body.role;
    }
    if (typeof body.active === "boolean") {
      if (id === admin.id && !body.active) {
        throw new ApiError(400, "You cannot deactivate your own account");
      }
      data.active = body.active;
    }
    if ("monthlyTokenLimit" in body) {
      data.monthlyTokenLimit = limitOrNull(body.monthlyTokenLimit);
    }
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 8) throw new ApiError(400, "Password must be at least 8 characters");
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }

    await prisma.user.update({ where: { id }, data });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    if (id === admin.id) throw new ApiError(400, "You cannot delete your own account");
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, "User not found");
    await prisma.user.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

function limitOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
