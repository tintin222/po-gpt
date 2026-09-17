import { prisma } from "@/lib/prisma";

export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    // app is up even if DB is briefly unavailable
  }
  return Response.json({ ok: true, db });
}
