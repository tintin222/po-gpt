// Import the implementation file directly — the package's index entry runs
// debug code when it can't detect a parent module. Both packages are listed
// in serverExternalPackages, so these become plain require() calls at runtime
// (never bundled/minified by webpack).
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/javascript",
  "application/typescript",
  "application/csv",
]);
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml",
  "html", "htm", "js", "ts", "py", "java", "go", "rb", "rs", "sql", "sh", "log",
]);

export function isSupportedFile(name: string, mimeType: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return true;
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return true;
  }
  if (TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) return true;
  if (TEXT_MIME_TYPES.has(mimeType)) return true;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return false;
}

/** Extract plain text from an uploaded file buffer. Throws on unsupported/broken files. */
export async function extractText(
  name: string,
  mimeType: string,
  buffer: Buffer
): Promise<string> {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (mimeType === "application/pdf" || ext === "pdf") {
    const result = await pdfParse(buffer);
    return result.text ?? "";
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  if (
    TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p)) ||
    TEXT_MIME_TYPES.has(mimeType) ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return buffer.toString("utf8");
  }

  throw new Error(
    `Unsupported file type: ${mimeType || ext || "unknown"}. Supported: PDF, DOCX, and plain-text formats (txt, md, csv, json, code files).`
  );
}
