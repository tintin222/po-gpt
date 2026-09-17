import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

/**
 * Resolve the current session to a fresh DB user (role/active state may have
 * changed since the JWT was issued). Returns null when unauthenticated.
 */
export async function getSessionUser(): Promise<User | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !user.active) return null;
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Not authenticated");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Admin access required");
  return user;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.message, code: error.code ?? null },
      { status: error.status }
    );
  }
  console.error("[api]", error);
  const message = error instanceof Error ? error.message : "Internal server error";
  return Response.json({ error: message, code: null }, { status: 500 });
}
