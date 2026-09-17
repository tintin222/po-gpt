import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { dbMessagesToUI, getEnabledChatModels } from "@/lib/data";
import { getQuotaStatus } from "@/lib/usage";
import { ChatView } from "@/components/chat/chat-view";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const chat = await prisma.chat.findFirst({
    where: { id, userId: user.id },
    include: {
      project: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!chat) notFound();

  const [models, quota] = await Promise.all([getEnabledChatModels(), getQuotaStatus(user)]);

  return (
    <ChatView
      key={chat.id}
      chatId={chat.id}
      initialMessages={dbMessagesToUI(chat.messages)}
      models={models}
      initialModelId={chat.modelId}
      project={chat.project}
      quota={quota}
      greetingName={user.name}
    />
  );
}
