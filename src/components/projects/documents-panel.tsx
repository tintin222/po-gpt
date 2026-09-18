"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/utils";

export interface DocumentInfo {
  id: string;
  name: string;
  sizeBytes: number;
  status: "PROCESSING" | "READY" | "ERROR";
  embedded: boolean;
  error: string | null;
}

interface DocumentsPanelProps {
  projectId: string;
  initialDocuments: DocumentInfo[];
}

export function DocumentsPanel({ projectId, initialDocuments }: DocumentsPanelProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) return;
      const data = (await res.json()) as { documents: DocumentInfo[] };
      setDocuments(data.documents);
    } catch {
      // transient — ignore
    }
  }, [projectId]);

  // Poll while any document is processing.
  useEffect(() => {
    if (!documents.some((d) => d.status === "PROCESSING")) return;
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [documents, refresh]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of Array.from(files)) formData.append("files", file);
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error);
      toast.success(files.length === 1 ? "File uploaded — indexing…" : "Files uploaded — indexing…");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this file from the project knowledge base?")) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error);
      setDocuments((docs) => docs.filter((d) => d.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Knowledge</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Spinner /> : <Upload className="h-3.5 w-3.5" />}
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.docx,.xlsx,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml,.html,.htm,.js,.ts,.py,.java,.go,.rb,.rs,.sql,.sh,.log"
          onChange={(e) => void handleUpload(e.target.files)}
        />
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add PDFs, docs, or text files. Chats in this project will search them for relevant
          context.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-secondary/50"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm" title={doc.name}>
                  {doc.name}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {formatBytes(doc.sizeBytes)}
                  {doc.status === "PROCESSING" && (
                    <Badge variant="warning" className="px-1.5 py-0">
                      indexing…
                    </Badge>
                  )}
                  {doc.status === "READY" && (
                    <Badge variant="success" className="px-1.5 py-0">
                      {doc.embedded ? "semantic" : "keyword"}
                    </Badge>
                  )}
                  {doc.status === "ERROR" && (
                    <Badge variant="destructive" className="px-1.5 py-0" title={doc.error ?? ""}>
                      failed
                    </Badge>
                  )}
                </div>
                {doc.status === "ERROR" && doc.error && (
                  <p className="mt-0.5 text-[11px] text-destructive">{doc.error}</p>
                )}
              </div>
              <button
                onClick={() => void handleDelete(doc.id)}
                className="hidden shrink-0 rounded p-1 text-muted-foreground hover:text-destructive group-hover:block cursor-pointer"
                aria-label="Delete file"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
