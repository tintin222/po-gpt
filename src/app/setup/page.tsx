import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { appName } from "@/lib/data";
import { SetupForm } from "@/components/auth/setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  let userCount = 0;
  try {
    userCount = await prisma.user.count();
  } catch {
    // let the form render; the API will fail with a clear error if DB is down
  }
  if (userCount > 0) redirect("/login");

  return <SetupForm appName={appName()} />;
}
