import ExcelJS from "exceljs";
import type { Response } from "express";

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
}

/**
 * Phase 2 P7 (docs/TODO.md): the one place that knows how to turn rows into
 * a downloadable .xlsx response, so every export endpoint gets consistent
 * formatting (bold header row, sized columns) instead of reimplementing it.
 */
export async function sendXlsx(res: Response, filename: string, sheets: XlsxSheet[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  for (const sheetDef of sheets) {
    const sheet = workbook.addWorksheet(sheetDef.name);
    sheet.columns = sheetDef.columns.map((c) => ({ ...c, width: c.width ?? 20 }));
    sheet.addRows(sheetDef.rows);
    sheet.getRow(1).font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}
