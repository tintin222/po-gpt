import type { UIMessage } from "ai";
import { prisma } from "@/lib/prisma";
import type { ChatModelOption } from "@/components/chat/model-picker";

export async function getSidebarData(userId: string) {
  const [chats, projects] = await Promise.all([
    prisma.chat.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: { id: true, title: true, projectId: true, updatedAt: true },
    }),
    prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);
  return {
    chats: chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })),
    projects,
  };
}

export async function getEnabledChatModels(): Promise<ChatModelOption[]> {
  const models = await prisma.llmModel.findMany({
    where: { kind: "CHAT", enabled: true },
    include: { provider: { select: { name: true, type: true } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return models.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    modelKey: m.modelKey,
    isDefault: m.isDefault,
    providerName: m.provider.name,
    providerType: m.provider.type,
  }));
}

export function dbMessagesToUI(
  messages: Array<{ id: string; role: string; parts: unknown }>
): UIMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: (Array.isArray(m.parts) ? m.parts : []) as UIMessage["parts"],
    }));
}

export function appName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME || "PO-GPT";
}
