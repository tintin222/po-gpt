import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

/**
 * Compact Markdown → .docx converter covering the constructs LLMs emit most:
 * headings, paragraphs, bullet/numbered lists, tables, fenced code, quotes,
 * horizontal rules, and inline bold/italic/code.
 */

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  code?: boolean;
}

function inlineRuns(text: string, base: InlineStyle = {}): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  const push = (t: string, style: InlineStyle) => {
    if (!t) return;
    runs.push(
      new TextRun({
        text: t,
        bold: style.bold,
        italics: style.italics,
        font: style.code ? "Consolas" : undefined,
        shading: style.code
          ? { type: ShadingType.CLEAR, fill: "ECEDF1" }
          : undefined,
      })
    );
  };

  while ((match = pattern.exec(text)) !== null) {
    push(text.slice(last, match.index), base);
    const token = match[0];
    if (token.startsWith("`")) {
      push(token.slice(1, -1), { ...base, code: true });
    } else if (token.startsWith("**")) {
      push(token.slice(2, -2), { ...base, bold: true });
    } else {
      push(token.slice(1, -1), { ...base, italics: true });
    }
    last = match.index + token.length;
  }
  push(text.slice(last), base);
  return runs.length > 0 ? runs : [new TextRun({ text: "" })];
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 2;
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function markdownToDocxChildren(markdown: string): Array<Paragraph | Table> {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const children: Array<Paragraph | Table> = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // closing fence
      for (const codeLine of codeLines.length > 0 ? codeLines : [""]) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: codeLine || " ", font: "Consolas", size: 18 })],
            shading: { type: ShadingType.CLEAR, fill: "F4F4F5" },
            spacing: { before: 0, after: 0 },
          })
        );
      }
      children.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    // Blank line
    if (trimmed === "") {
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      children.push(
        new Paragraph({
          heading: HEADING_LEVELS[headingMatch[1].length - 1],
          children: inlineRuns(headingMatch[2].replace(/#+\s*$/, "").trim()),
        })
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D6D8DD" } },
          spacing: { before: 120, after: 240 },
        })
      );
      i++;
      continue;
    }

    // Table
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const headers = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const makeCell = (text: string, header: boolean) =>
        new TableCell({
          children: [
            new Paragraph({ children: inlineRuns(text, header ? { bold: true } : {}) }),
          ],
          shading: header ? { type: ShadingType.CLEAR, fill: "ECEDF1" } : undefined,
        });
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: headers.map((h) => makeCell(h, true)) }),
            ...rows.map(
              (r) =>
                new TableRow({
                  children: headers.map((_, ci) => makeCell(r[ci] ?? "", false)),
                })
            ),
          ],
        })
      );
      children.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      children.push(
        new Paragraph({
          children: inlineRuns(trimmed.slice(2), { italics: true }),
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: "D6D8DD" } },
          spacing: { after: 120 },
        })
      );
      i++;
      continue;
    }

    // List item (bulleted or numbered)
    const listMatch = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      const level = Math.min(Math.floor(listMatch[1].length / 2), 2);
      const ordered = /\d/.test(listMatch[2][0]);
      children.push(
        new Paragraph({
          children: ordered
            ? [new TextRun({ text: `${listMatch[2]} ` }), ...inlineRuns(listMatch[3])]
            : inlineRuns(listMatch[3]),
          bullet: ordered ? undefined : { level },
          indent: ordered ? { left: 720 * (level + 1), hanging: 360 } : undefined,
          spacing: { after: 60 },
        })
      );
      i++;
      continue;
    }

    // Plain paragraph (merge consecutive non-empty, non-special lines)
    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("> ") &&
      !/^(\s*)([-*+]|\d{1,3}[.)])\s+/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    children.push(
      new Paragraph({
        children: inlineRuns(paraLines.join(" ")),
        spacing: { after: 160 },
        alignment: AlignmentType.LEFT,
      })
    );
  }

  return children;
}

export async function markdownToDocx(title: string, markdown: string): Promise<Buffer> {
  const doc = new Document({
    creator: process.env.NEXT_PUBLIC_APP_NAME || "PO-GPT",
    title,
    styles: {
      default: {
        document: { run: { font: "Roboto", size: 22 } },
        heading1: { run: { size: 40, bold: true, color: "000C19" } },
        heading2: { run: { size: 32, bold: true, color: "000C19" } },
        heading3: { run: { size: 26, bold: true, color: "343A40" } },
        heading4: { run: { size: 24, bold: true, color: "343A40" } },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: title, bold: true, color: "ED1D24" })],
            spacing: { after: 300 },
          }),
          ...markdownToDocxChildren(markdown),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
