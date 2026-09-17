import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { appName } from "@/lib/data";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let userCount = 1;
  try {
    userCount = await prisma.user.count();
  } catch {
    // DB unreachable — show the login form anyway
  }
  if (userCount === 0) redirect("/setup");

  return <LoginForm appName={appName()} />;
}
