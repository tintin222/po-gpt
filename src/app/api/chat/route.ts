import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError, ApiError } from "@/lib/session";
import { languageModelFor, resolveChatModel } from "@/lib/llm";
import { getQuotaStatus, recordUsage } from "@/lib/usage";
import { buildSystemPrompt, retrieveProjectContext } from "@/lib/rag";
import { buildDocumentTools } from "@/lib/docgen/tools";
import { formatTokens } from "@/lib/utils";
import type { RetrievedChunk } from "@/lib/vector";

export const maxDuration = 600;

function textOf(message: UIMessage): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n")
    .trim();
}

const MAX_IMAGE_PARTS = 3;
const MAX_IMAGE_DATA_CHARS = 2_800_000; // ≈2 MB of binary as base64
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,/;

/**
 * Validate the incoming user message: keep text, the UI-only attachment-chip
 * part, and inline image file parts. Remote file URLs are rejected outright —
 * the server would otherwise fetch them on the user's behalf (SSRF).
 */
function sanitizeIncomingParts(parts: UIMessage["parts"]): UIMessage["parts"] {
  const out: UIMessage["parts"] = [];
  let images = 0;
  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string") {
      out.push({ type: "text", text: part.text.slice(0, 200_000) });
    } else if (part.type === "data-attachments") {
      out.push(part);
    } else if (part.type === "file") {
      const file = part as { url?: unknown; mediaType?: unknown; filename?: unknown };
      if (
        images < MAX_IMAGE_PARTS &&
        typeof file.url === "string" &&
        IMAGE_DATA_URL.test(file.url) &&
        file.url.length <= MAX_IMAGE_DATA_CHARS &&
        typeof file.mediaType === "string" &&
        file.mediaType.startsWith("image/")
      ) {
        images++;
        out.push(part);
      }
    }
    // anything else from the client is dropped
  }
  return out;
}

/**
 * Prepare stored UI messages for the model: drop UI-only data parts
 * (e.g. attachment chips), and when the model runs without tools also drop
 * tool-call parts (providers reject tool blocks when no tools are declared).
 */
function sanitizeForModel(messages: UIMessage[], keepTools: boolean): UIMessage[] {
  return messages
    .map((m) => ({
      ...m,
      parts: m.parts.filter((p) => {
        if (p.type.startsWith("data-")) return false;
        if (!keepTools && (p.type.startsWith("tool-") || p.type === "dynamic-tool")) return false;
        return true;
      }),
    }))
    .filter((m) => {
      if (m.parts.length === 0) return false;
      if (m.role === "user") return true;
      return m.parts.some(
        (p) => (p.type === "text" && p.text.trim() !== "") || !p.type.startsWith("text")
      );
    });
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      chatId?: string;
      message?: UIMessage;
      modelId?: string | null;
    };

    const chatId = body.chatId;
    const incoming = body.message;
    if (!chatId || !incoming || incoming.role !== "user" || !Array.isArray(incoming.parts)) {
      throw new ApiError(400, "Invalid chat request");
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId: user.id },
      include: { project: true },
    });
    if (!chat) throw new ApiError(404, "Chat not found");

    const quota = await getQuotaStatus(user);
    if (quota.exceeded) {
      throw new ApiError(
        429,
        `You've reached your monthly token limit (${formatTokens(quota.limit)} tokens). Your quota resets next month — contact an administrator if you need more.`,
        "TOKEN_LIMIT"
      );
    }

    const model = await resolveChatModel(body.modelId, chat.modelId);
    const cleanParts = sanitizeIncomingParts(incoming.parts);
    if (cleanParts.length === 0) throw new ApiError(400, "Empty message");
    const cleanMessage: UIMessage = { ...incoming, parts: cleanParts };
    const userText = textOf(cleanMessage);

    await prisma.message.create({
      data: {
        chatId,
        role: "user",
        parts: cleanParts as unknown as Prisma.InputJsonValue,
      },
    });

    const messageCount = await prisma.message.count({ where: { chatId } });
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        updatedAt: new Date(),
        ...(model.id !== chat.modelId ? { modelId: model.id } : {}),
        ...(messageCount === 1 && userText
          ? { title: userText.replace(/\s+/g, " ").slice(0, 80) }
          : {}),
      },
    });

    const dbMessages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    });
    const uiMessages: UIMessage[] = dbMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        parts: m.parts as unknown as UIMessage["parts"],
      }));

    let contextChunks: RetrievedChunk[] = [];
    if (chat.projectId && userText) {
      contextChunks = await retrieveProjectContext(chat.projectId, userText).catch((e) => {
        console.warn("[chat] retrieval failed:", e);
        return [];
      });
    }

    const attachments = await prisma.chatAttachment.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      select: { name: true, content: true },
    });

    const useTools = model.toolsEnabled;

    const system = buildSystemPrompt({
      appName: process.env.NEXT_PUBLIC_APP_NAME || "PO-GPT",
      userName: user.name,
      project: chat.project
        ? {
            name: chat.project.name,
            instructions: chat.project.instructions,
            memory: chat.project.memory,
          }
        : null,
      contextChunks,
      documentTools: useTools,
      attachments,
    });

    let finalUsage: { inputTokens?: number; outputTokens?: number } = {};

    const result = streamText({
      model: languageModelFor(model),
      system,
      messages: convertToModelMessages(sanitizeForModel(uiMessages, useTools)),
      ...(useTools
        ? {
            tools: buildDocumentTools({ userId: user.id, chatId }),
            stopWhen: stepCountIs(6),
          }
        : {}),
      onFinish: ({ totalUsage }) => {
        finalUsage = {
          inputTokens: totalUsage.inputTokens ?? 0,
          outputTokens: totalUsage.outputTokens ?? 0,
        };
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: uiMessages,
      sendReasoning: true,
      onError: (error) => {
        console.error("[chat] stream error:", error);
        return error instanceof Error ? error.message : "The model request failed.";
      },
      onFinish: async ({ responseMessage }) => {
        try {
          const inputTokens = finalUsage.inputTokens ?? 0;
          const outputTokens = finalUsage.outputTokens ?? 0;
          await prisma.message.create({
            data: {
              chatId,
              role: "assistant",
              parts: responseMessage.parts as unknown as Prisma.InputJsonValue,
              modelKey: model.modelKey,
              inputTokens,
              outputTokens,
            },
          });
          if (inputTokens + outputTokens > 0) {
            await recordUsage({
              userId: user.id,
              chatId,
              modelKey: model.modelKey,
              providerType: model.provider.type,
              inputTokens,
              outputTokens,
              inputPricePerMTok: model.inputPricePerMTok,
              outputPricePerMTok: model.outputPricePerMTok,
            });
          }
          await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
        } catch (e) {
          console.error("[chat] failed to persist assistant message:", e);
        }
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
