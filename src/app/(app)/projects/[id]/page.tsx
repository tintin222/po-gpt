import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { getEnabledChatModels } from "@/lib/data";
import { relativeTime } from "@/lib/utils";
import { ProjectComposer } from "@/components/projects/project-composer";
import { ProjectSettingsMenu, EditableCard } from "@/components/projects/project-editors";
import { DocumentsPanel } from "@/components/projects/documents-panel";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, ownerId: user.id },
    include: {
      chats: {
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { id: true, title: true, updatedAt: true },
      },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const models = await getEnabledChatModels();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 text-xs text-muted-foreground">
              <Link href="/projects" className="hover:underline">
                Projects
              </Link>
              <span className="mx-1.5">/</span>
              <span>{project.name}</span>
            </div>
            <h1 className="truncate font-serif text-3xl font-medium tracking-tight">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
          <ProjectSettingsMenu
            project={{
              id: project.id,
              name: project.name,
              description: project.description,
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          {/* Main column */}
          <div className="min-w-0">
            <ProjectComposer projectId={project.id} projectName={project.name} models={models} />

            <div className="mt-8">
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent chats
              </h2>
              {project.chats.length === 0 ? (
                <p className="px-1 py-6 text-sm text-muted-foreground">
                  No chats in this project yet. Start one above — it will use this project&apos;s
                  instructions and knowledge.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {project.chats.map((chat) => (
                    <Link
                      key={chat.id}
                      href={`/chat/${chat.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-secondary/40"
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeTime(chat.updatedAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-4">
            <EditableCard
              projectId={project.id}
              field="instructions"
              title="Instructions"
              emptyHint="Add instructions to tailor the assistant's responses in this project."
              value={project.instructions}
            />
            <EditableCard
              projectId={project.id}
              field="memory"
              title="Memory"
              emptyHint="Notes the assistant should always remember for this project."
              value={project.memory}
            />
            <DocumentsPanel
              projectId={project.id}
              initialDocuments={project.documents.map((d) => ({
                id: d.id,
                name: d.name,
                sizeBytes: d.sizeBytes,
                status: d.status,
                embedded: d.embedded,
                error: d.error,
              }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
