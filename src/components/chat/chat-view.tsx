"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import { AlertTriangle, ArrowUp, Brain, FolderKanban, Square } from "lucide-react";
import { formatTokens } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { ModelPicker, type ChatModelOption } from "@/components/chat/model-picker";
import { ArtifactProvider } from "@/components/chat/artifact-panel";
import { ToolFileCard, type ToolLikePart } from "@/components/chat/file-card";

export interface QuotaInfo {
  used: number;
  limit: number; // 0 = unlimited
  exceeded: boolean;
}

interface ChatViewProps {
  chatId: string | null;
  initialMessages: UIMessage[];
  models: ChatModelOption[];
  initialModelId: string | null;
  project: { id: string; name: string } | null;
  quota: QuotaInfo;
  greetingName: string;
}

function parseErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch {
    // not JSON — use as-is
  }
  return raw || "Something went wrong";
}

export function ChatView({
  chatId,
  initialMessages,
  models,
  initialModelId,
  project,
  quota,
  greetingName,
}: ChatViewProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState<string | null>(
    initialModelId ?? models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? null
  );
  const [creating, setCreating] = useState(false);
  const [limitHit, setLimitHit] = useState(quota.exceeded);
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, id, body }) => ({
          body: {
            chatId: id,
            message: messages[messages.length - 1],
            modelId: modelIdRef.current,
            ...body,
          },
        }),
      }),
    []
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: chatId ?? "new",
    messages: initialMessages,
    transport,
    onError: (err) => {
      const message = parseErrorMessage(err);
      if (message.toLowerCase().includes("token limit")) setLimitHit(true);
      toast.error(message);
    },
    onFinish: () => {
      router.refresh();
    },
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Auto-send a draft handed over from the new-chat / project composer.
  const draftSentRef = useRef(false);
  useEffect(() => {
    if (!chatId || draftSentRef.current) return;
    draftSentRef.current = true;
    try {
      const key = `pogpt:draft:${chatId}`;
      const draft = sessionStorage.getItem(key);
      if (draft && initialMessages.length === 0) {
        sessionStorage.removeItem(key);
        void sendMessage({ text: draft });
      }
    } catch {
      // sessionStorage unavailable — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Auto-scroll while near the bottom.
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && autoScrollRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  async function handleSubmit() {
    const text = input.trim();
    if (!text || isStreaming || creating || limitHit) return;
    if (models.length === 0) {
      toast.error("No chat models are configured yet. Ask an administrator to add one.");
      return;
    }

    if (!chatId) {
      // Create the chat first, stash the draft, then navigate into it.
      setCreating(true);
      try {
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project?.id ?? null, modelId }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error);
        const { id } = (await res.json()) as { id: string };
        try {
          sessionStorage.setItem(`pogpt:draft:${id}`, text);
        } catch {
          // ignore
        }
        router.push(`/chat/${id}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not start chat");
        setCreating(false);
      }
      return;
    }

    setInput("");
    requestAnimationFrame(resizeTextarea);
    autoScrollRef.current = true;
    void sendMessage({ text });
  }

  const empty = messages.length === 0;

  const composer = (
    <div className="w-full">
      {limitHit && (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            You&apos;ve reached your monthly token limit
            {quota.limit > 0 && <> ({formatTokens(quota.limit)} tokens)</>}. Your quota resets next
            month — contact an administrator if you need more.
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:shadow-md">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            resizeTextarea();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={
            limitHit
              ? "Monthly token limit reached"
              : project
                ? `Message ${project.name}…`
                : "How can I help you today?"
          }
          disabled={limitHit}
          rows={2}
          className="max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
          <ModelPicker models={models} value={modelId} onChange={setModelId} disabled={isStreaming} />
          {isStreaming ? (
            <button
              type="button"
              onClick={() => stop()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80 cursor-pointer"
              aria-label="Stop generating"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!input.trim() || creating || limitHit}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30 cursor-pointer"
              aria-label="Send message"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        AI responses may contain mistakes — verify important information.
      </p>
    </div>
  );

  if (empty) {
    return (
      <ArtifactProvider>
        <div className="flex h-full flex-col">
          {project && <ProjectBanner project={project} />}
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-24">
            <div className="w-full max-w-2xl">
              <h1 className="mb-8 text-center font-display text-[2rem] font-medium tracking-tight text-foreground/90">
                {greetingHour()}, {greetingName.split(" ")[0]}
              </h1>
              {composer}
            </div>
          </div>
        </div>
      </ArtifactProvider>
    );
  }

  return (
    <ArtifactProvider>
      <div className="flex h-full flex-col">
        {project && <ProjectBanner project={project} />}
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-8">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {status === "submitted" && (
              <div className="flex items-center gap-1.5 py-3 pl-1">
                <span className="thinking-dot h-2 w-2 rounded-full bg-primary" />
                <span className="thinking-dot h-2 w-2 rounded-full bg-primary" />
                <span className="thinking-dot h-2 w-2 rounded-full bg-primary" />
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 px-4 pb-4">
          <div className="mx-auto w-full max-w-3xl">{composer}</div>
        </div>
      </div>
    </ArtifactProvider>
  );
}

function greetingHour(): string {
  const h = new Date().getHours();
  if (h < 5) return "Hello";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function ProjectBanner({ project }: { project: { id: string; name: string } }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-5 py-2 text-sm">
      <FolderKanban className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">Project:</span>
      <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
        {project.name}
      </Link>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    return (
      <div className="mb-6 flex justify-end animate-fade-in">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-[15px] leading-relaxed">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 animate-fade-in">
      {message.parts.map((part, i) => {
        if (part.type === "reasoning") {
          const text = part.text?.trim();
          if (!text) return null;
          return (
            <details
              key={i}
              className="group mb-3 rounded-xl border border-border bg-secondary/30 px-4 py-2.5"
            >
              <summary className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
                <Brain className="h-4 w-4" />
                Thought process
              </summary>
              <div className="mt-2 whitespace-pre-wrap text-sm italic text-muted-foreground">
                {text}
              </div>
            </details>
          );
        }
        if (part.type === "text") {
          return (
            <div key={i} className="text-[15px]">
              <Markdown>{part.text}</Markdown>
            </div>
          );
        }
        if (part.type.startsWith("tool-")) {
          return <ToolFileCard key={i} part={part as unknown as ToolLikePart} />;
        }
        return null;
      })}
    </div>
  );
}
