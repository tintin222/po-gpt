"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  BarChart3,
  ChevronDown,
  FolderKanban,
  LogOut,
  MessageSquare,
  MessagesSquare,
  PenSquare,
  Settings2,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SidebarChat {
  id: string;
  title: string;
  projectId: string | null;
  updatedAt: string;
}

export interface SidebarProject {
  id: string;
  name: string;
}

interface AppSidebarProps {
  appName: string;
  user: { name: string; email: string; role: "ADMIN" | "USER" };
  chats: SidebarChat[];
  projects: SidebarProject[];
}

export function AppSidebar({ appName, user, chats, projects }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function deleteChat(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this chat? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Chat deleted");
      if (pathname === `/chat/${id}`) router.push("/chat");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete chat");
    } finally {
      setDeleting(null);
    }
  }

  const navItem = (href: string, active: boolean, icon: React.ReactNode, label: string) => (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-foreground"
          : "text-foreground/70 hover:bg-sidebar-accent/60 hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="font-serif text-lg font-semibold tracking-tight">{appName}</span>
      </div>

      {/* New chat */}
      <div className="px-3 pb-1 pt-2">
        <Button
          className="w-full justify-start gap-2.5"
          variant="outline"
          onClick={() => router.push("/chat")}
        >
          <PenSquare className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 py-2">
        {navItem("/chat", pathname === "/chat", <MessageSquare className="h-4 w-4" />, "Chats")}
        {navItem(
          "/projects",
          pathname.startsWith("/projects"),
          <FolderKanban className="h-4 w-4" />,
          "Projects"
        )}
        {user.role === "ADMIN" && (
          <div className="mt-2">
            <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </div>
            {navItem("/admin", pathname === "/admin", <BarChart3 className="h-4 w-4" />, "Overview")}
            {navItem(
              "/admin/providers",
              pathname.startsWith("/admin/providers"),
              <Settings2 className="h-4 w-4" />,
              "Models & providers"
            )}
            {navItem(
              "/admin/users",
              pathname.startsWith("/admin/users"),
              <Users className="h-4 w-4" />,
              "Users"
            )}
            {navItem(
              "/admin/usage",
              pathname.startsWith("/admin/usage"),
              <MessagesSquare className="h-4 w-4" />,
              "Usage"
            )}
          </div>
        )}
      </nav>

      {/* Recents */}
      <div className="mt-1 flex-1 overflow-y-auto px-3 pb-2">
        {projects.length > 0 && (
          <>
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Projects
            </div>
            <div className="flex flex-col gap-0.5">
              {projects.slice(0, 5).map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className={cn(
                    "truncate rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                    pathname === `/projects/${p.id}`
                      ? "bg-sidebar-accent text-foreground"
                      : "text-foreground/70 hover:bg-sidebar-accent/60 hover:text-foreground"
                  )}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recents
        </div>
        <div className="flex flex-col gap-0.5">
          {chats.length === 0 && (
            <p className="px-2.5 py-1.5 text-sm text-muted-foreground">No chats yet</p>
          )}
          {chats.map((chat) => {
            const active = pathname === `/chat/${chat.id}`;
            return (
              <Link
                key={chat.id}
                href={`/chat/${chat.id}`}
                title={chat.title}
                className={cn(
                  "group flex items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-foreground/70 hover:bg-sidebar-accent/60 hover:text-foreground"
                )}
              >
                <span className="truncate">{chat.title}</span>
                <button
                  onClick={(e) => deleteChat(chat.id, e)}
                  disabled={deleting === chat.id}
                  className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block cursor-pointer"
                  aria-label="Delete chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Link>
            );
          })}
        </div>
      </div>

      {/* User menu */}
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/60 cursor-pointer">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase text-secondary-foreground">
                {user.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>
              {user.role === "ADMIN" ? "Administrator" : "Member"}
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push("/usage")}>
              <BarChart3 />
              My usage
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                // Redirect client-side: server-derived URLs can point at the
                // internal host (localhost:8080) behind Railway's proxy.
                await signOut({ redirect: false });
                window.location.assign("/login");
              }}
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
