"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AppWindow, Check, Code2, Copy, Download, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ArtifactData {
  title: string;
  language: string;
  content: string;
}

const ArtifactContext = createContext<{ open: (artifact: ArtifactData) => void }>({
  open: () => {},
});

export function useArtifact() {
  return useContext(ArtifactContext);
}

export function ArtifactProvider({ children }: { children: React.ReactNode }) {
  const [artifact, setArtifact] = useState<ArtifactData | null>(null);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  const open = useCallback((a: ArtifactData) => {
    setArtifact(a);
    setTab("preview");
  }, []);

  function download() {
    if (!artifact) return;
    const ext = artifact.language === "svg" ? "svg" : "html";
    const blob = new Blob([artifact.content], {
      type: artifact.language === "svg" ? "image/svg+xml" : "text/html",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.replace(/[^\w\s-]/g, "").trim() || "artifact"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <ArtifactContext.Provider value={{ open }}>
      {children}
      {artifact && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-[min(760px,92vw)] flex-col border-l border-border bg-card shadow-2xl animate-fade-in">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <AppWindow className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{artifact.title}</span>
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button
                onClick={() => setTab("preview")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  tab === "preview" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                onClick={() => setTab("code")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  tab === "code" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Code2 className="h-3.5 w-3.5" />
                Code
              </button>
            </div>
            <button
              onClick={copy}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              aria-label="Copy code"
              title="Copy code"
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={download}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              aria-label="Download"
              title="Download file"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={() => setArtifact(null)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          {tab === "preview" ? (
            <iframe
              key={artifact.content.length /* refresh as it streams */}
              srcDoc={artifact.content}
              sandbox="allow-scripts allow-popups allow-forms allow-modals"
              className="h-full w-full flex-1 bg-white"
              title={artifact.title}
            />
          ) : (
            <pre className="flex-1 overflow-auto bg-[#262521] p-4 text-[13px] leading-relaxed text-[#f2f0e8]">
              <code>{artifact.content}</code>
            </pre>
          )}
        </div>
      )}
    </ArtifactContext.Provider>
  );
}

export function ArtifactCard({ language, code }: { language: string; code: string }) {
  const { open } = useArtifact();
  const title =
    /<title[^>]*>([^<]+)<\/title>/i.exec(code)?.[1]?.trim() ||
    (language === "svg" ? "SVG graphic" : "Interactive artifact");

  return (
    <button
      type="button"
      onClick={() => open({ title, language, content: code })}
      className="group my-3 flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md cursor-pointer"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <AppWindow className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">
          {language.toUpperCase()} · {code.split("\n").length} lines · click to preview
        </div>
      </div>
      <Eye className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
  );
}
