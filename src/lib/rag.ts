import { embed, embedMany } from "ai";
import { prisma } from "@/lib/prisma";
import { chunkText } from "@/lib/chunk";
import { extractText } from "@/lib/extract";
import { embeddingModelFor, getEmbeddingModel, type ModelWithProvider } from "@/lib/llm";
import {
  EMBEDDING_DIM,
  fullTextSearch,
  isVectorReady,
  storeChunkEmbedding,
  vectorSearch,
  type RetrievedChunk,
} from "@/lib/vector";

const EMBED_BATCH_SIZE = 64;
const RETRIEVAL_LIMIT = 8;
const MAX_CONTEXT_CHARS = 12_000;

function embeddingProviderOptions(model: ModelWithProvider) {
  // Gemini embedding models support Matryoshka truncation to our fixed dim.
  if (model.provider.type === "GOOGLE") {
    return { google: { outputDimensionality: EMBEDDING_DIM } };
  }
  return undefined;
}

/**
 * Extract → chunk → embed a document. Runs in the background after upload.
 * Embedding failures degrade gracefully: the document stays READY and is
 * served by full-text search instead of semantic search.
 */
export async function processDocument(documentId: string, buffer: Buffer): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;

  try {
    const text = await extractText(doc.name, doc.mimeType, buffer);
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error("No extractable text found in this file");
    }

    await prisma.documentChunk.createMany({
      data: chunks.map((content, seq) => ({ documentId, seq, content })),
    });

    let embedded = false;
    const embeddingModel = await getEmbeddingModel();
    if (embeddingModel && (await isVectorReady())) {
      try {
        const rows = await prisma.documentChunk.findMany({
          where: { documentId },
          orderBy: { seq: "asc" },
          select: { id: true, content: true },
        });
        const model = embeddingModelFor(embeddingModel);
        const providerOptions = embeddingProviderOptions(embeddingModel);
        for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
          const batch = rows.slice(i, i + EMBED_BATCH_SIZE);
          const { embeddings } = await embedMany({
            model,
            values: batch.map((r) => r.content),
            ...(providerOptions ? { providerOptions } : {}),
          });
          for (let j = 0; j < batch.length; j++) {
            await storeChunkEmbedding(batch[j].id, embeddings[j]);
          }
        }
        embedded = true;
      } catch (e) {
        console.warn(`[rag] embedding failed for document ${documentId}:`, e);
      }
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { status: "READY", embedded, error: null },
    });
  } catch (e) {
    console.error(`[rag] document processing failed for ${documentId}:`, e);
    const message = e instanceof Error ? e.message : "Processing failed";
    await prisma.document
      .update({ where: { id: documentId }, data: { status: "ERROR", error: message } })
      .catch(() => {});
  }
}

/** Retrieve the most relevant project document chunks for a query. */
export async function retrieveProjectContext(
  projectId: string,
  query: string,
  limit = RETRIEVAL_LIMIT
): Promise<RetrievedChunk[]> {
  const hasDocs = await prisma.document.count({ where: { projectId, status: "READY" } });
  if (hasDocs === 0) return [];

  let results: RetrievedChunk[] = [];

  if (await isVectorReady()) {
    const embeddingModel = await getEmbeddingModel();
    if (embeddingModel) {
      try {
        const { embedding } = await embed({
          model: embeddingModelFor(embeddingModel),
          value: query.slice(0, 2000),
          ...(embeddingProviderOptions(embeddingModel)
            ? { providerOptions: embeddingProviderOptions(embeddingModel) }
            : {}),
        });
        results = await vectorSearch(projectId, embedding, limit);
      } catch (e) {
        console.warn("[rag] query embedding failed, falling back to full-text search:", e);
      }
    }
  }

  if (results.length < limit) {
    const seen = new Set(results.map((r) => r.id));
    const ftsResults = await fullTextSearch(projectId, query, limit);
    for (const r of ftsResults) {
      if (!seen.has(r.id) && results.length < limit) results.push(r);
    }
  }

  return results;
}

export interface SystemPromptParts {
  appName: string;
  userName: string;
  project?: { name: string; instructions: string; memory: string } | null;
  contextChunks?: RetrievedChunk[];
  documentTools?: boolean;
}

export function buildSystemPrompt({
  appName,
  userName,
  project,
  contextChunks,
  documentTools,
}: SystemPromptParts): string {
  const sections: string[] = [
    `You are the AI assistant of ${appName}, an internal company platform. You are helpful, precise, and professional. The current date is ${new Date().toISOString().slice(0, 10)}. You are talking to ${userName}. Format responses in Markdown when helpful.`,
    `Artifacts: when the user asks for an interactive web page, dashboard, visualization, diagram, game, or mini-app, respond with ONE complete, self-contained HTML document inside a single \`\`\`html code block (inline CSS and JavaScript; external libraries only from well-known CDNs). Include a <title>. The platform renders it as a live preview next to the chat. For static vector graphics you may use a \`\`\`svg block instead.`,
  ];

  if (documentTools) {
    sections.push(
      `File deliverables: you have tools that produce real downloadable files — createDocument (Word .docx from Markdown), createPresentation (PowerPoint .pptx from structured slides), and createSpreadsheet (Excel .xlsx from tabular data). Call the matching tool whenever the user asks for a document, report, deck, presentation, spreadsheet, or "file" deliverable. Put the COMPLETE final content into the tool call. After the tool returns, reply with a one-or-two sentence confirmation of what the file contains — the user already sees a download card, so never paste the file's content again. Do not use these tools for ordinary chat answers.`
    );
  }

  if (project) {
    sections.push(`The user is working inside the project "${project.name}".`);
    if (project.instructions.trim()) {
      sections.push(`<project_instructions>\n${project.instructions.trim()}\n</project_instructions>`);
    }
    if (project.memory.trim()) {
      sections.push(`<project_memory>\n${project.memory.trim()}\n</project_memory>`);
    }
  }

  if (contextChunks && contextChunks.length > 0) {
    let used = 0;
    const parts: string[] = [];
    for (const chunk of contextChunks) {
      const snippet = chunk.content.slice(0, MAX_CONTEXT_CHARS - used);
      if (snippet.length < 50 && parts.length > 0) break;
      parts.push(`<excerpt source="${chunk.documentName.replace(/"/g, "'")}">\n${snippet}\n</excerpt>`);
      used += snippet.length;
      if (used >= MAX_CONTEXT_CHARS) break;
    }
    sections.push(
      `Relevant excerpts from the project's knowledge base are provided below. Ground your answers in them when applicable and mention the source document name when you rely on one. If the excerpts don't contain the answer, say so rather than inventing details.\n\n<project_knowledge>\n${parts.join("\n\n")}\n</project_knowledge>`
    );
  }

  return sections.join("\n\n");
}
