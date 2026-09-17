import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getSidebarData, appName } from "@/lib/data";
import { AppSidebar } from "@/components/app-sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { chats, projects } = await getSidebarData(user.id);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        appName={appName()}
        user={{ name: user.name, email: user.email, role: user.role }}
        chats={chats}
        projects={projects}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
