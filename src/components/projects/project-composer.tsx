"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ModelPicker, type ChatModelOption } from "@/components/chat/model-picker";

interface ProjectComposerProps {
  projectId: string;
  projectName: string;
  models: ChatModelOption[];
}

export function ProjectComposer({ projectId, projectName, models }: ProjectComposerProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState<string | null>(
    models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? null
  );
  const [creating, setCreating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function handleSubmit() {
    const text = input.trim();
    if (!text || creating) return;
    if (models.length === 0) {
      toast.error("No chat models are configured yet. Ask an administrator to add one.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, modelId }),
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
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:shadow-md">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          resize();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void handleSubmit();
          }
        }}
        placeholder={`Start a chat in ${projectName}…`}
        rows={2}
        className="max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
        <ModelPicker models={models} value={modelId} onChange={setModelId} />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!input.trim() || creating}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30 cursor-pointer"
          aria-label="Send message"
        >
          {creating ? <Spinner className="h-4 w-4 text-primary-foreground" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
