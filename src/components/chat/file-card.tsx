"use client";

import { AlertCircle, Download, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/utils";

export interface ToolLikePart {
  type: string;
  state?: string;
  output?: unknown;
  errorText?: string;
}

interface FileOutput {
  ok?: boolean;
  fileId?: string;
  fileName?: string;
  url?: string;
  sizeBytes?: number;
}

const TOOL_META: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  "tool-createDocument": { label: "Word document", icon: FileText, color: "text-blue-700 bg-blue-700/10" },
  "tool-createPresentation": { label: "PowerPoint presentation", icon: Presentation, color: "text-orange-700 bg-orange-700/10" },
  "tool-createSpreadsheet": { label: "Excel spreadsheet", icon: FileSpreadsheet, color: "text-green-700 bg-green-700/10" },
};

export function ToolFileCard({ part }: { part: ToolLikePart }) {
  const meta = TOOL_META[part.type];
  if (!meta) return null;
  const Icon = meta.icon;

  if (part.state === "output-error") {
    return (
      <div className="my-3 flex w-full max-w-md items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 text-sm">
          <div className="font-medium text-destructive">Couldn&apos;t create the {meta.label.toLowerCase()}</div>
          {part.errorText && <div className="mt-0.5 text-xs text-muted-foreground">{part.errorText}</div>}
        </div>
      </div>
    );
  }

  const output = (part.output ?? null) as FileOutput | null;

  if (part.state !== "output-available" || !output?.url) {
    return (
      <div className="my-3 flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <Spinner />
        <div className="text-sm text-muted-foreground">Creating {meta.label.toLowerCase()}…</div>
      </div>
    );
  }

  return (
    <div className="my-3 flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={output.fileName}>
          {output.fileName}
        </div>
        <div className="text-xs text-muted-foreground">
          {meta.label}
          {typeof output.sizeBytes === "number" && <> · {formatBytes(output.sizeBytes)}</>}
        </div>
      </div>
      <a
        href={output.url}
        download
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90"
        aria-label={`Download ${output.fileName}`}
        title="Download"
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}
