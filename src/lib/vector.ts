import { prisma } from "@/lib/prisma";

export const EMBEDDING_DIM = 1536;

let vectorReadyCache: boolean | null = null;

/**
 * Whether pgvector is installed AND the embedding column exists.
 * Cached per process; bootstrap() attempts setup at startup.
 */
export async function isVectorReady(): Promise<boolean> {
  if (vectorReadyCache !== null) return vectorReadyCache;
  try {
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS ok
      FROM information_schema.columns
      WHERE table_name = 'DocumentChunk' AND column_name = 'embedding'
    `;
    vectorReadyCache = rows.length > 0;
  } catch {
    vectorReadyCache = false;
  }
  return vectorReadyCache;
}

/**
 * Best-effort pgvector setup. Never throws — when the extension is
 * unavailable the app degrades to Postgres full-text search for RAG.
 */
export async function setupVector(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch (e) {
    console.warn(
      "[bootstrap] pgvector extension unavailable — RAG will use full-text search fallback.",
      e instanceof Error ? e.message : e
    );
    vectorReadyCache = false;
    return false;
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS embedding vector(${EMBEDDING_DIM})`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
       ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops)`
    );
    vectorReadyCache = true;
    console.log("[bootstrap] pgvector ready (semantic search enabled)");
    return true;
  } catch (e) {
    console.warn("[bootstrap] pgvector column/index setup failed:", e);
    vectorReadyCache = null; // re-check lazily
    return false;
  }
}

/** Normalize an embedding to the fixed dimension (pad/truncate + L2 norm). */
export function normalizeEmbedding(vec: number[]): number[] {
  let v = vec;
  if (v.length > EMBEDDING_DIM) v = v.slice(0, EMBEDDING_DIM);
  if (v.length < EMBEDDING_DIM) v = [...v, ...new Array(EMBEDDING_DIM - v.length).fill(0)];
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((x) => (Number.isFinite(x) ? x.toFixed(8) : "0")).join(",")}]`;
}

export async function storeChunkEmbedding(chunkId: string, embedding: number[]): Promise<void> {
  const literal = toVectorLiteral(normalizeEmbedding(embedding));
  await prisma.$executeRaw`
    UPDATE "DocumentChunk" SET embedding = ${literal}::vector WHERE id = ${chunkId}
  `;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  documentName: string;
  score: number;
}

export async function vectorSearch(
  projectId: string,
  queryEmbedding: number[],
  limit: number
): Promise<RetrievedChunk[]> {
  const literal = toVectorLiteral(normalizeEmbedding(queryEmbedding));
  const rows = await prisma.$queryRaw<
    Array<{ id: string; content: string; documentName: string; score: number }>
  >`
    SELECT c.id, c.content, d.name AS "documentName",
           1 - (c.embedding <=> ${literal}::vector) AS score
    FROM "DocumentChunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE d."projectId" = ${projectId}
      AND d.status = 'READY'
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${literal}::vector ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

export async function fullTextSearch(
  projectId: string,
  query: string,
  limit: number
): Promise<RetrievedChunk[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.$queryRaw<
    Array<{ id: string; content: string; documentName: string; score: number }>
  >`
    SELECT c.id, c.content, d.name AS "documentName",
           ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', ${q})) AS score
    FROM "DocumentChunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE d."projectId" = ${projectId}
      AND d.status = 'READY'
      AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', ${q})
    ORDER BY score DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}
