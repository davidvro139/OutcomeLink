import ExcelJS from "exceljs";
import type { Response } from "express";
import { ApiError } from "./apiError";

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
 * an .xlsx workbook, so every export gets consistent formatting (bold header
 * row, sized columns) instead of reimplementing it. Returns a raw `Buffer`
 * rather than writing to a `Response` — Scheduled Reports (Phase 3,
 * docs/TODO.md) generates a workbook outside of any HTTP request/response
 * cycle, so `sendXlsx()` below is now just this plus the response headers.
 */
export async function buildXlsxBuffer(sheets: XlsxSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  for (const sheetDef of sheets) {
    const sheet = workbook.addWorksheet(sheetDef.name);
    sheet.columns = sheetDef.columns.map((c) => ({ ...c, width: c.width ?? 20 }));
    sheet.addRows(sheetDef.rows);
    sheet.getRow(1).font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function sendXlsx(res: Response, filename: string, sheets: XlsxSheet[]): Promise<void> {
  const buffer = await buildXlsxBuffer(sheets);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // Rich text and formula cells come back as objects rather than scalars.
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
  }
  return String(value);
}

/**
 * The read-side counterpart to sendXlsx(), for the bulk Import System
 * (spec §51's "CSV, Excel, and SIS exports"): turns the first worksheet of an
 * uploaded .xlsx into the same {headers, rows} shape parseCsv() produces from
 * a .csv, so everything downstream of "which file format was this" (mapping,
 * validation, preview, commit) stays format-agnostic.
 */
export async function readXlsxRows(buffer: Buffer): Promise<{ headers: string[]; rows: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw ApiError.badRequest("Excel file has no worksheet");

  const allRows: string[][] = [];
  sheet.eachRow((row) => {
    // ExcelJS's row.values is 1-indexed — index 0 is always empty.
    const values = row.values as ExcelJS.CellValue[];
    allRows.push(values.slice(1).map(cellToString));
  });

  const [headers, ...dataRows] = allRows;
  if (!headers || headers.length === 0) throw ApiError.badRequest("Excel file has no header row");
  return { headers, rows: dataRows };
}
