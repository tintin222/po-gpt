import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { markdownToDocx } from "@/lib/docgen/markdown-docx";
import { buildPptx } from "@/lib/docgen/pptx";
import { buildXlsx } from "@/lib/docgen/xlsx";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

function fileNameFrom(title: string, ext: string): string {
  const base =
    title
      .replace(/[\\/:*?"<>|#%&{}]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "document";
  return `${base}.${ext}`;
}

async function saveGeneratedFile(params: {
  userId: string;
  chatId: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
}) {
  if (params.buffer.length > MAX_FILE_BYTES) {
    throw new Error("Generated file exceeds the 15 MB limit — produce a smaller file.");
  }
  const file = await prisma.generatedFile.create({
    data: {
      userId: params.userId,
      chatId: params.chatId,
      name: params.name,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.length,
      data: new Uint8Array(params.buffer),
    },
    select: { id: true, name: true, sizeBytes: true },
  });
  return {
    ok: true as const,
    fileId: file.id,
    fileName: file.name,
    url: `/api/files/${file.id}`,
    sizeBytes: file.sizeBytes,
    message:
      "File created. The user sees a download card for it in the chat — briefly confirm and summarize; do not repeat the full content.",
  };
}

/**
 * Document-generation tools exposed to the model. Deterministic builders —
 * no model-written code is ever executed on the server.
 */
export function buildDocumentTools(ctx: { userId: string; chatId: string }) {
  return {
    createDocument: tool({
      description:
        "Create a downloadable Microsoft Word (.docx) document from Markdown. Use when the user asks for a document, report, memo, letter, policy, or similar written deliverable as a file. Write the COMPLETE, polished content — headings (#, ##), paragraphs, bullet/numbered lists, tables, **bold**, *italic*, and fenced code are all rendered with professional formatting.",
      inputSchema: z.object({
        title: z.string().min(1).max(150).describe("Document title (also used as the file name)"),
        content: z
          .string()
          .min(1)
          .max(150_000)
          .describe("Full document body in Markdown. Do not repeat the title as the first heading."),
      }),
      execute: async ({ title, content }) => {
        const buffer = await markdownToDocx(title, content);
        return saveGeneratedFile({
          userId: ctx.userId,
          chatId: ctx.chatId,
          name: fileNameFrom(title, "docx"),
          mimeType: MIME.docx,
          buffer,
        });
      },
    }),

    createPresentation: tool({
      description:
        "Create a downloadable PowerPoint (.pptx) presentation with a styled title slide and content slides. Use when the user asks for a presentation, slide deck, or pitch. Keep bullets concise (max ~10 words each); put detail in speaker notes.",
      inputSchema: z.object({
        title: z.string().min(1).max(150).describe("Presentation title for the title slide and file name"),
        subtitle: z.string().max(200).optional().describe("Optional subtitle for the title slide"),
        slides: z
          .array(
            z.object({
              title: z.string().min(1).max(150).describe("Slide headline"),
              bullets: z
                .array(z.string().max(300))
                .max(12)
                .describe("Bullet points. Prefix with '- ' to make a sub-bullet."),
              notes: z.string().max(3000).optional().describe("Optional speaker notes"),
            })
          )
          .min(1)
          .max(40),
      }),
      execute: async ({ title, subtitle, slides }) => {
        const buffer = await buildPptx({ title, subtitle, slides });
        return saveGeneratedFile({
          userId: ctx.userId,
          chatId: ctx.chatId,
          name: fileNameFrom(title, "pptx"),
          mimeType: MIME.pptx,
          buffer,
        });
      },
    }),

    createSpreadsheet: tool({
      description:
        "Create a downloadable Excel (.xlsx) workbook from tabular data. Use when the user asks for a spreadsheet, table export, budget, tracker, or dataset as a file. Numeric-looking cells are stored as real numbers.",
      inputSchema: z.object({
        title: z.string().min(1).max(150).describe("Workbook file name"),
        sheets: z
          .array(
            z.object({
              name: z.string().min(1).max(31).describe("Sheet tab name (max 31 chars)"),
              headers: z.array(z.string().max(120)).max(60).optional().describe("Column headers"),
              rows: z
                .array(z.array(z.string().max(2000)).max(60))
                .max(5000)
                .describe("Data rows. Pass numbers as plain strings like \"42\" or \"3.14\" — they are auto-typed."),
            })
          )
          .min(1)
          .max(10),
      }),
      execute: async ({ title, sheets }) => {
        const buffer = await buildXlsx(sheets);
        return saveGeneratedFile({
          userId: ctx.userId,
          chatId: ctx.chatId,
          name: fileNameFrom(title, "xlsx"),
          mimeType: MIME.xlsx,
          buffer,
        });
      },
    }),
  };
}
