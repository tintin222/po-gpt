export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("@/lib/bootstrap");
    await bootstrap().catch((e) => console.warn("[bootstrap] failed:", e));
  }
}
