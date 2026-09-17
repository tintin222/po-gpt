import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { jsonError, ApiError } from "@/lib/session";

/** Creates the initial admin account. Only works while no users exist. */
export async function POST(req: Request) {
  try {
    const count = await prisma.user.count();
    if (count > 0) throw new ApiError(403, "Setup has already been completed");

    const body = (await req.json()) as { name?: string; email?: string; password?: string };
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");

    if (!name || !email || !/.+@.+\..+/.test(email)) {
      throw new ApiError(400, "A valid name and email are required");
    }
    if (password.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters");
    }

    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: "ADMIN",
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
