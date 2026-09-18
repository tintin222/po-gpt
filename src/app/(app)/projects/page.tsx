import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderKanban, FileText, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { relativeTime } from "@/lib/utils";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { chats: true, documents: true } } },
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-medium tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Group chats with shared instructions, memory, and a knowledge base.
            </p>
          </div>
          <NewProjectDialog />
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
            <FolderKanban className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No projects yet. Create one to give your chats shared context.
            </p>
            <NewProjectDialog triggerLabel="Create your first project" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <FolderKanban className="h-4 w-4" />
                </div>
                <h2 className="font-display text-lg font-medium leading-snug group-hover:text-primary">
                  {project.name}
                </h2>
                {project.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {project.description}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-4 pt-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {project._count.chats}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {project._count.documents}
                  </span>
                  <span className="ml-auto">{relativeTime(project.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
