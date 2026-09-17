import ExcelJS from "exceljs";

export interface SheetSpec {
  name: string;
  headers?: string[];
  rows: string[][];
}

function sanitizeSheetName(name: string, index: number): string {
  const clean = name.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31);
  return clean || `Sheet${index + 1}`;
}

/** "42" / "3.14" / "-7" cells become real numbers so formulas work. */
function typedCell(value: string): string | number {
  const t = value.trim();
  if (/^-?\d{1,15}(\.\d{1,10})?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return value;
}

export async function buildXlsx(sheets: SheetSpec[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = process.env.NEXT_PUBLIC_APP_NAME || "PO-GPT";
  workbook.created = new Date();

  sheets.forEach((spec, index) => {
    const ws = workbook.addWorksheet(sanitizeSheetName(spec.name, index));

    if (spec.headers && spec.headers.length > 0) {
      const headerRow = ws.addRow(spec.headers);
      headerRow.font = { bold: true, color: { argb: "FF292824" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0EEE6" },
      };
      headerRow.border = { bottom: { style: "thin", color: { argb: "FFD9D5C8" } } };
      ws.views = [{ state: "frozen", ySplit: 1 }];
    }

    for (const row of spec.rows) {
      ws.addRow(row.map(typedCell));
    }

    // Approximate auto-width per column
    const columnCount = Math.max(spec.headers?.length ?? 0, ...spec.rows.map((r) => r.length), 1);
    for (let c = 1; c <= columnCount; c++) {
      let width = spec.headers?.[c - 1]?.length ?? 8;
      for (const row of spec.rows.slice(0, 200)) {
        width = Math.max(width, String(row[c - 1] ?? "").length);
      }
      ws.getColumn(c).width = Math.min(Math.max(width + 2, 8), 60);
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
