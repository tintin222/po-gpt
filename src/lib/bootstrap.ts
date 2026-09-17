import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setupVector } from "@/lib/vector";

/**
 * Idempotent startup tasks. Runs from instrumentation.ts on server boot.
 * Every step is best-effort — the app must still boot if the DB is briefly
 * unreachable (migrations run separately via `prisma migrate deploy`).
 */
export async function bootstrap(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    console.warn("[bootstrap] database not reachable yet, skipping bootstrap:", e);
    return;
  }

  await setupVector();

  try {
    await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  } catch (e) {
    console.warn("[bootstrap] could not ensure app settings:", e);
  }

  try {
    const userCount = await prisma.user.count();
    const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
    const password = process.env.ADMIN_PASSWORD;
    if (userCount === 0 && email && password) {
      await prisma.user.create({
        data: {
          email,
          name: process.env.ADMIN_NAME || "Administrator",
          passwordHash: await bcrypt.hash(password, 12),
          role: "ADMIN",
        },
      });
      console.log(`[bootstrap] created initial admin account: ${email}`);
    }
  } catch (e) {
    console.warn("[bootstrap] could not create initial admin:", e);
  }
}
