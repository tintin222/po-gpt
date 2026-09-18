// Import the implementation file directly — the package's index entry runs
// debug code when it can't detect a parent module. Both packages are listed
// in serverExternalPackages, so these become plain require() calls at runtime
// (never bundled/minified by webpack).
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import ExcelJS from "exceljs";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_XLSX_ROWS_PER_SHEET = 5000;

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
  if (mimeType === DOCX_MIME || ext === "docx") return true;
  if (mimeType === XLSX_MIME || ext === "xlsx") return true;
  if (TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) return true;
  if (TEXT_MIME_TYPES.has(mimeType)) return true;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return false;
}

/** Excel workbook → readable text: one block per sheet, rows as "a | b | c". */
async function extractXlsx(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: string[] = [];
  workbook.eachSheet((worksheet) => {
    const lines: string[] = [`## Sheet: ${worksheet.name}`];
    let count = 0;
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (count >= MAX_XLSX_ROWS_PER_SHEET) return;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        cells.push(String(cell.text ?? "").replace(/\s+/g, " ").trim());
      });
      // drop fully empty rows
      if (cells.some((c) => c !== "")) {
        lines.push(cells.join(" | "));
        count++;
      }
    });
    if (count >= MAX_XLSX_ROWS_PER_SHEET) {
      lines.push(`… (truncated at ${MAX_XLSX_ROWS_PER_SHEET} rows)`);
    }
    sheets.push(lines.join("\n"));
  });

  return sheets.join("\n\n");
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

  if (mimeType === DOCX_MIME || ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  if (mimeType === XLSX_MIME || ext === "xlsx") {
    return extractXlsx(buffer);
  }

  if (ext === "xls") {
    throw new Error(
      "Legacy .xls files are not supported — please re-save the file as .xlsx and upload again."
    );
  }

  if (
    TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p)) ||
    TEXT_MIME_TYPES.has(mimeType) ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return buffer.toString("utf8");
  }

  throw new Error(
    `Unsupported file type: ${mimeType || ext || "unknown"}. Supported: PDF, DOCX, XLSX, and plain-text formats (txt, md, csv, json, code files).`
  );
}
