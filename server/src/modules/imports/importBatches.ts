import type { Request, Response } from "express";
import type { ImportColumnMapping, ImportTargetField } from "@outcomelink/shared";
import { IMPORT_REQUIRED_TARGET_FIELDS, IMPORT_TARGET_FIELDS } from "@outcomelink/shared";
import { parse } from "csv-parse/sync";
import multer from "multer";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { importStorage } from "../../lib/storage";
import { prisma } from "../../lib/prisma";
import { createStudentSchema } from "../students/students";
import { columnMappingSchema } from "./mappingProfiles";

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

export const createBatchSchema = z.object({
  sourceSystem: z.string().trim().min(1).max(200),
});
type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const setMappingSchema = z.object({
  columnMapping: columnMappingSchema,
  mappingProfileId: z.coerce.number().int().positive().optional(),
  saveAsProfile: z.boolean().optional(),
});
type SetMappingInput = z.infer<typeof setMappingSchema>;

export const previewQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
type PreviewQuery = z.infer<typeof previewQuerySchema>;

/**
 * Deliberately parsed with `columns: false` (plain string[][] rows) rather
 * than csv-parse's `columns: true` object-mode, which builds row objects
 * keyed by the file's own header strings — the exact code path a real
 * advisory (GHSA-8cw4-87c7-c6xx, prototype pollution via untrusted column
 * names) was found in. Header names here are user-controlled input from an
 * uploaded file; indexing into a plain array by a validated integer offset
 * sidesteps that class of bug entirely instead of just upgrading past it.
 */
function parseCsv(buffer: Buffer): { headers: string[]; rows: string[][] } {
  const records = parse(buffer, { skip_empty_lines: true, trim: true }) as string[][];
  const [headers, ...rows] = records;
  if (!headers || headers.length === 0) throw ApiError.badRequest("CSV file has no header row");
  return { headers, rows };
}

function buildFieldIndex(
  headers: string[],
  mapping: ImportColumnMapping,
): Partial<Record<ImportTargetField, number>> {
  const index: Partial<Record<ImportTargetField, number>> = {};
  for (const [sourceColumn, targetField] of Object.entries(mapping)) {
    if (!targetField) continue;
    const columnIndex = headers.indexOf(sourceColumn);
    if (columnIndex !== -1) index[targetField] = columnIndex;
  }
  return index;
}

function mapRow(
  row: string[],
  fieldIndex: Partial<Record<ImportTargetField, number>>,
): Partial<Record<ImportTargetField, string>> {
  const candidate: Partial<Record<ImportTargetField, string>> = {};
  for (const field of IMPORT_TARGET_FIELDS) {
    const columnIndex = fieldIndex[field];
    if (columnIndex === undefined) continue;
    const value = row[columnIndex]?.trim();
    if (value) candidate[field] = value;
  }
  return candidate;
}

async function findOwnedBatch(institutionId: number, id: number) {
  const batch = await prisma.importBatch.findFirst({ where: { id, institutionId } });
  if (!batch) throw ApiError.notFound("Import batch not found");
  return batch;
}

export async function list(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const batches = await prisma.importBatch.findMany({
    where: { institutionId },
    orderBy: { uploadedAt: "desc" },
    include: { mappingProfile: { select: { id: true, sourceSystemName: true } } },
  });
  sendData(res, { batches });
}

export async function show(req: Request, res: Response) {
  const batch = await findOwnedBatch(req.user!.institutionId, Number(req.params.id));
  const [rowErrors, { headers: sourceColumns }] = await Promise.all([
    prisma.importRowError.findMany({
      where: { importBatchId: batch.id },
      orderBy: { rowNumber: "asc" },
    }),
    parseCsv(await importStorage.load(batch.fileReference)),
  ]);
  sendData(res, { batch, rowErrors, sourceColumns });
}

export async function create(
  req: Request<Record<string, never>, unknown, CreateBatchInput>,
  res: Response,
) {
  if (!req.file) throw ApiError.badRequest("A CSV file is required");
  const institutionId = req.user!.institutionId;
  const { sourceSystem } = req.body;

  const { headers, rows } = parseCsv(req.file.buffer);

  const [uploader, suggestedProfile, { fileReference }] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user!.sub }, select: { name: true } }),
    prisma.importMappingProfile.findUnique({
      where: { institutionId_sourceSystemName: { institutionId, sourceSystemName: sourceSystem } },
    }),
    importStorage.save({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    }),
  ]);

  const batch = await prisma.importBatch.create({
    data: {
      institutionId,
      sourceSystem,
      originalFilename: req.file.originalname,
      fileReference,
      totalRows: rows.length,
      uploadedBy: uploader?.name ?? String(req.user!.sub),
    },
  });

  sendData(res, { batch, sourceColumns: headers, suggestedProfile }, 201);
}

export async function setMapping(
  req: Request<{ id: string }, unknown, SetMappingInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const batch = await findOwnedBatch(institutionId, Number(req.params.id));
  const { columnMapping, mappingProfileId, saveAsProfile } = req.body;

  const { headers } = parseCsv(await importStorage.load(batch.fileReference));
  for (const sourceColumn of Object.keys(columnMapping)) {
    if (!headers.includes(sourceColumn)) {
      throw ApiError.badRequest(`Column "${sourceColumn}" is not present in this file`);
    }
  }
  const mappedTargets = new Set(Object.values(columnMapping));
  const missingRequired = IMPORT_REQUIRED_TARGET_FIELDS.filter((f) => !mappedTargets.has(f));
  if (missingRequired.length > 0) {
    throw ApiError.badRequest(`Required fields not mapped: ${missingRequired.join(", ")}`);
  }

  if (mappingProfileId) {
    const profile = await prisma.importMappingProfile.findFirst({
      where: { id: mappingProfileId, institutionId },
    });
    if (!profile) throw ApiError.badRequest("Unknown mappingProfileId");
  }

  if (saveAsProfile) {
    await prisma.importMappingProfile.upsert({
      where: {
        institutionId_sourceSystemName: { institutionId, sourceSystemName: batch.sourceSystem },
      },
      create: { institutionId, sourceSystemName: batch.sourceSystem, columnMapping },
      update: { columnMapping },
    });
  }

  const updated = await prisma.importBatch.update({
    where: { id: batch.id },
    data: { columnMapping, mappingProfileId, status: "MAPPED" },
  });
  sendData(res, { batch: updated });
}

export async function validateBatch(req: Request<{ id: string }>, res: Response) {
  const institutionId = req.user!.institutionId;
  const batch = await findOwnedBatch(institutionId, Number(req.params.id));
  if (!batch.columnMapping) throw ApiError.badRequest("Set a column mapping before validating");

  const mapping = batch.columnMapping as ImportColumnMapping;
  const { headers, rows } = parseCsv(await importStorage.load(batch.fileReference));
  const fieldIndex = buildFieldIndex(headers, mapping);
  const candidates = rows.map((row) => mapRow(row, fieldIndex));

  const existingIds = new Set(
    (
      await prisma.student.findMany({
        where: {
          institutionId,
          internalStudentId: {
            in: candidates.map((c) => c.internalStudentId).filter((v): v is string => !!v),
          },
        },
        select: { internalStudentId: true },
      })
    ).map((s) => s.internalStudentId),
  );

  const seenIds = new Map<string, number>();
  const rowErrorsToCreate: { rowNumber: number; errorMessage: string; rawRowData: Record<string, string> }[] = [];
  let validCount = 0;

  candidates.forEach((candidate, i) => {
    const rowNumber = i + 1;
    const issues: string[] = [];

    const parsed = createStudentSchema.safeParse(candidate);
    if (!parsed.success) issues.push(...parsed.error.issues.map((issue) => issue.message));

    if (candidate.internalStudentId) {
      if (existingIds.has(candidate.internalStudentId)) {
        issues.push(`Student ID "${candidate.internalStudentId}" already exists`);
      }
      const firstSeenRow = seenIds.get(candidate.internalStudentId);
      if (firstSeenRow === undefined) {
        seenIds.set(candidate.internalStudentId, rowNumber);
      } else {
        issues.push(`Duplicate Student ID within this file (first seen at row ${firstSeenRow})`);
      }
    }

    if (issues.length > 0) {
      const rawRowData = Object.fromEntries(headers.map((h, colIdx) => [h, rows[i]![colIdx] ?? ""]));
      rowErrorsToCreate.push({ rowNumber, errorMessage: issues.join("; "), rawRowData });
    } else {
      validCount += 1;
    }
  });

  await prisma.importRowError.deleteMany({ where: { importBatchId: batch.id } });
  if (rowErrorsToCreate.length > 0) {
    await prisma.importRowError.createMany({
      data: rowErrorsToCreate.map((e) => ({ ...e, importBatchId: batch.id })),
    });
  }

  const updated = await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: "VALIDATED", totalRows: rows.length },
  });

  sendData(res, {
    batch: updated,
    validRowCount: validCount,
    errorRowCount: rowErrorsToCreate.length,
  });
}

async function loadValidCandidates(batch: { id: number; fileReference: string; columnMapping: unknown }) {
  const mapping = batch.columnMapping as ImportColumnMapping;
  const { headers, rows } = parseCsv(await importStorage.load(batch.fileReference));
  const fieldIndex = buildFieldIndex(headers, mapping);

  const errorRowNumbers = new Set(
    (
      await prisma.importRowError.findMany({
        where: { importBatchId: batch.id },
        select: { rowNumber: true },
      })
    ).map((e) => e.rowNumber),
  );

  return rows
    .map((row, i) => ({ rowNumber: i + 1, candidate: mapRow(row, fieldIndex) }))
    .filter((r) => !errorRowNumbers.has(r.rowNumber));
}

export async function preview(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const batch = await findOwnedBatch(institutionId, Number(req.params.id));
  if (!batch.columnMapping) throw ApiError.badRequest("Set a column mapping first");
  const { page, pageSize } = req.query as unknown as PreviewQuery;

  const validRows = await loadValidCandidates(batch);
  const totalErrorRows = await prisma.importRowError.count({ where: { importBatchId: batch.id } });

  const start = (page - 1) * pageSize;
  const items = validRows.slice(start, start + pageSize);

  if (batch.status === "VALIDATED") {
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "PREVIEWED" } });
  }

  sendData(res, {
    items,
    page,
    pageSize,
    totalValidRows: validRows.length,
    totalErrorRows,
  });
}

export async function commit(req: Request<{ id: string }>, res: Response) {
  const institutionId = req.user!.institutionId;
  const batch = await findOwnedBatch(institutionId, Number(req.params.id));
  if (batch.status !== "VALIDATED" && batch.status !== "PREVIEWED") {
    throw ApiError.badRequest("Validate this batch before committing");
  }
  if (!batch.columnMapping) throw ApiError.badRequest("Set a column mapping first");

  const validRows = await loadValidCandidates(batch);
  if (validRows.length === 0) {
    throw ApiError.badRequest("No valid rows to import — resolve validation errors first");
  }

  const created = await prisma.student.createMany({
    data: validRows.map(({ candidate }) => ({
      institutionId,
      internalStudentId: candidate.internalStudentId!,
      firstName: candidate.firstName!,
      lastName: candidate.lastName!,
      preferredName: candidate.preferredName,
      email: candidate.email,
      phone: candidate.phone,
    })),
    skipDuplicates: true,
  });

  const updated = await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: "IMPORTED", importedRowCount: created.count },
  });

  sendData(res, { batch: updated, importedRowCount: created.count });
}
