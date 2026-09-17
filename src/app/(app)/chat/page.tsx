import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getEnabledChatModels } from "@/lib/data";
import { getQuotaStatus } from "@/lib/usage";
import { ChatView } from "@/components/chat/chat-view";

export const dynamic = "force-dynamic";

export default async function NewChatPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [models, quota] = await Promise.all([getEnabledChatModels(), getQuotaStatus(user)]);

  return (
    <ChatView
      chatId={null}
      initialMessages={[]}
      models={models}
      initialModelId={null}
      project={null}
      quota={quota}
      greetingName={user.name}
    />
  );
}
