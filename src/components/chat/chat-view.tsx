"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUp,
  Brain,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { formatBytes, formatTokens } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { ModelPicker, type ChatModelOption } from "@/components/chat/model-picker";
import { ArtifactProvider } from "@/components/chat/artifact-panel";
import { ToolFileCard, type ToolLikePart } from "@/components/chat/file-card";
import { Spinner } from "@/components/ui/spinner";

const ATTACH_ACCEPT =
  ".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml,.html,.htm,.js,.ts,.py,.java,.go,.rb,.rs,.sql,.sh,.log";

const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_DATAURL_CHARS = 1_800_000;

interface AttachmentMeta {
  name: string;
  sizeBytes: number;
}

interface ImagePart {
  type: "file";
  mediaType: string;
  url: string;
  filename: string;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Downscale/re-encode an image so it fits comfortably in context and storage. */
async function prepareImage(file: File): Promise<ImagePart> {
  if (file.size < 600_000) {
    const url = await readAsDataURL(file);
    if (url.startsWith("data:image/") && url.length <= MAX_IMAGE_DATAURL_CHARS) {
      return { type: "file", mediaType: file.type || "image/png", url, filename: file.name };
    }
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let url = canvas.toDataURL("image/jpeg", 0.82);
  if (file.type === "image/png") {
    const png = canvas.toDataURL("image/png");
    if (png.length <= MAX_IMAGE_DATAURL_CHARS && png.length < url.length * 1.6) url = png;
  }
  if (url.length > MAX_IMAGE_DATAURL_CHARS) url = canvas.toDataURL("image/jpeg", 0.6);
  if (url.length > MAX_IMAGE_DATAURL_CHARS) {
    throw new Error(`"${file.name}" is too large even after compression — try a smaller image.`);
  }
  const mediaType = url.slice(5, url.indexOf(";"));
  return { type: "file", mediaType, url, filename: file.name };
}

/** UI-only message part carrying attachment chips (never sent to the model). */
function attachmentsOf(message: UIMessage): AttachmentMeta[] {
  for (const part of message.parts) {
    if (part.type === "data-attachments") {
      const data = (part as { data?: unknown }).data;
      if (Array.isArray(data)) return data as AttachmentMeta[];
    }
  }
  return [];
}

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
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [limitHit, setLimitHit] = useState(quota.exceeded);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  function sendWithAttachments(
    text: string,
    attachmentMeta: AttachmentMeta[],
    imageParts: ImagePart[] = []
  ) {
    if (attachmentMeta.length === 0 && imageParts.length === 0) {
      void sendMessage({ text });
      return;
    }
    const message = {
      role: "user",
      parts: [
        ...imageParts,
        { type: "text", text },
        ...(attachmentMeta.length > 0
          ? [{ type: "data-attachments", data: attachmentMeta }]
          : []),
      ],
    };
    void sendMessage(message as unknown as Parameters<typeof sendMessage>[0]);
  }

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
        try {
          const parsed = JSON.parse(draft) as {
            t?: string;
            a?: AttachmentMeta[];
            imgs?: ImagePart[];
          };
          if (parsed && typeof parsed.t === "string") {
            sendWithAttachments(
              parsed.t,
              Array.isArray(parsed.a) ? parsed.a : [],
              Array.isArray(parsed.imgs) ? parsed.imgs : []
            );
            return;
          }
        } catch {
          // legacy plain-text draft
        }
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

  async function uploadAttachments(targetChatId: string, files: File[]): Promise<AttachmentMeta[]> {
    const formData = new FormData();
    for (const file of files) formData.append("files", file);
    const res = await fetch(`/api/chats/${targetChatId}/attachments`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw new Error(((await res.json()) as { error?: string }).error ?? "Upload failed");
    }
    const data = (await res.json()) as { attachments: AttachmentMeta[] };
    return data.attachments.map((a) => ({ name: a.name, sizeBytes: a.sizeBytes }));
  }

  async function handleSubmit() {
    const text = input.trim();
    if (isStreaming || creating || uploading || limitHit) return;
    if (!text) {
      if (pendingFiles.length > 0) {
        toast.error("Add a short message to send with your file(s).");
      }
      return;
    }
    if (models.length === 0) {
      toast.error("No chat models are configured yet. Ask an administrator to add one.");
      return;
    }

    const imageFiles = pendingFiles.filter(isImageFile);
    const docFiles = pendingFiles.filter((f) => !isImageFile(f));
    if (imageFiles.length > MAX_IMAGES_PER_MESSAGE) {
      toast.error(`At most ${MAX_IMAGES_PER_MESSAGE} images per message.`);
      return;
    }

    if (!chatId) {
      // Create the chat, upload attachments, stash the draft, then navigate.
      setCreating(true);
      let createdId: string | null = null;
      try {
        const imageParts = await Promise.all(imageFiles.map(prepareImage));

        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project?.id ?? null, modelId }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error);
        createdId = ((await res.json()) as { id: string }).id;

        let meta: AttachmentMeta[] = [];
        if (docFiles.length > 0) {
          meta = await uploadAttachments(createdId, docFiles);
        }
        try {
          sessionStorage.setItem(
            `pogpt:draft:${createdId}`,
            JSON.stringify({ t: text, a: meta, imgs: imageParts })
          );
        } catch {
          throw new Error(
            "Attached images are too large to carry into a new chat — send a message first, then attach them."
          );
        }
        router.push(`/chat/${createdId}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not start chat");
        if (createdId) {
          void fetch(`/api/chats/${createdId}`, { method: "DELETE" }).then(() => router.refresh());
        }
        setCreating(false);
      }
      return;
    }

    let meta: AttachmentMeta[] = [];
    let imageParts: ImagePart[] = [];
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        imageParts = await Promise.all(imageFiles.map(prepareImage));
        if (docFiles.length > 0) {
          meta = await uploadAttachments(chatId, docFiles);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        setUploading(false);
        return;
      }
      setUploading(false);
      setPendingFiles([]);
    }

    setInput("");
    requestAnimationFrame(resizeTextarea);
    autoScrollRef.current = true;
    sendWithAttachments(text, meta, imageParts);
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
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {pendingFiles.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-2 py-1 text-xs"
              >
                {isImageFile(file) ? (
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="max-w-[180px] truncate">{file.name}</span>
                <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setPendingFiles((fs) => fs.filter((_, j) => j !== i))}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive cursor-pointer"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
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
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={limitHit || uploading || pendingFiles.length >= 5}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 cursor-pointer"
              aria-label="Attach files"
              title="Attach files (PDF, Word, Excel, PowerPoint, images, text)"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept={ATTACH_ACCEPT}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length > 0) {
                  setPendingFiles((fs) => [...fs, ...picked].slice(0, 5));
                }
                e.target.value = "";
              }}
            />
            <ModelPicker models={models} value={modelId} onChange={setModelId} disabled={isStreaming} />
          </div>
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
              disabled={!input.trim() || creating || uploading || limitHit}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30 cursor-pointer"
              aria-label="Send message"
            >
              {creating || uploading ? (
                <Spinner className="h-4 w-4 text-primary-foreground" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
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
    const attachments = attachmentsOf(message);
    const images = message.parts.filter(
      (p): p is Extract<typeof p, { type: "file" }> =>
        p.type === "file" &&
        typeof (p as { mediaType?: string }).mediaType === "string" &&
        (p as { mediaType: string }).mediaType.startsWith("image/")
    );
    return (
      <div className="mb-6 flex flex-col items-end gap-1.5 animate-fade-in">
        {images.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={(img as { url: string }).url}
                alt={(img as { filename?: string }).filename ?? "attached image"}
                className="max-h-64 max-w-full rounded-xl border border-border object-contain shadow-sm"
              />
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {attachments.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs shadow-sm"
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="max-w-[200px] truncate">{a.name}</span>
                {typeof a.sizeBytes === "number" && (
                  <span className="text-muted-foreground">{formatBytes(a.sizeBytes)}</span>
                )}
              </span>
            ))}
          </div>
        )}
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
