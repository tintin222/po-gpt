"use client";

import { isValidElement, memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { ArtifactCard } from "@/components/chat/artifact-panel";

function nodeToText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

const ARTIFACT_LANGUAGES = new Set(["html", "svg"]);
const ARTIFACT_MIN_CHARS = 400;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable
        }
      }}
      className="absolute right-2 top-2 hidden rounded-md bg-white/10 p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white group-hover:block cursor-pointer"
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function PreBlock({ children }: { children?: React.ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children;
  let language = "";
  if (isValidElement(child)) {
    const className = (child.props as { className?: string }).className ?? "";
    language = /language-([\w+-]+)/.exec(className)?.[1]?.toLowerCase() ?? "";
  }
  const code = nodeToText(children);

  if (ARTIFACT_LANGUAGES.has(language) && code.length >= ARTIFACT_MIN_CHARS) {
    return <ArtifactCard language={language} code={code} />;
  }

  return (
    <div className="group relative">
      <pre>{children}</pre>
      <CopyButton text={code} />
    </div>
  );
}

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
          pre: PreBlock,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
