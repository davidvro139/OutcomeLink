import type { Request, Response } from "express";
import type { ImportColumnMapping, ImportTargetField } from "@outcomelink/shared";
import {
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUSES,
  IMPORT_ACCEPTED_FILE_EXTENSIONS,
  IMPORT_ENROLLMENT_TARGET_FIELDS,
  IMPORT_REQUIRED_ENROLLMENT_TARGET_FIELDS,
  IMPORT_REQUIRED_TARGET_FIELDS,
  IMPORT_TARGET_FIELDS,
} from "@outcomelink/shared";
import { parse } from "csv-parse/sync";
import multer from "multer";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { importStorage } from "../../lib/storage";
import { prisma } from "../../lib/prisma";
import { readXlsxRows } from "../../lib/xlsx";
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
 * A real source file is far more likely to spell a status the way staff read
 * it ("Active", "Graduate Completer") than the internal enum spelling
 * ("ACTIVE") — accept either, case-insensitively, rather than forcing every
 * institution's export to happen to match our own enum literals exactly.
 */
const ENROLLMENT_STATUS_LOOKUP = new Map<string, (typeof ENROLLMENT_STATUSES)[number]>();
for (const status of ENROLLMENT_STATUSES) {
  ENROLLMENT_STATUS_LOOKUP.set(status.toLowerCase(), status);
  ENROLLMENT_STATUS_LOOKUP.set(ENROLLMENT_STATUS_LABELS[status].toLowerCase(), status);
}

/** A row's enrollment-subset once any enrollment field is mapped — see shared/src/imports.ts. */
const importEnrollmentSchema = z.object({
  programCode: z.string().trim().min(1),
  startDate: z.coerce.date(),
  enrollmentStatus: z.string().transform((value, ctx) => {
    const match = ENROLLMENT_STATUS_LOOKUP.get(value.trim().toLowerCase());
    if (!match) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown enrollment status "${value}"` });
      return z.NEVER;
    }
    return match;
  }),
  expectedCompletionDate: z.coerce.date().optional(),
  actualCompletionDate: z.coerce.date().optional(),
  credentialEarned: z.string().trim().max(200).optional(),
  enrollmentObjective: z.string().trim().max(100).optional(),
});

function isExcelFile(filename: string): boolean {
  return /\.xlsx?$/i.test(filename);
}

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

/** Dispatches on the stored original filename so every wizard step parses the same batch's file the same way. */
async function parseUploadedFile(
  buffer: Buffer,
  originalFilename: string,
): Promise<{ headers: string[]; rows: string[][] }> {
  return isExcelFile(originalFilename) ? readXlsxRows(buffer) : parseCsv(buffer);
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

/**
 * True once the mapping touches any enrollment field, which switches this
 * batch from "student roster only" to "also creates one StudentEnrollment per
 * row" — see shared/src/imports.ts's module doc comment for the full
 * reasoning, including why an already-existing internalStudentId stops being
 * a hard error in that mode (a returning student getting a new term's
 * enrollment is the normal case for a recurring SIS export, not an error).
 */
function importsEnrollments(mapping: ImportColumnMapping): boolean {
  const targets = new Set(Object.values(mapping));
  return IMPORT_ENROLLMENT_TARGET_FIELDS.some((f) => targets.has(f));
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
    parseUploadedFile(await importStorage.load(batch.fileReference), batch.originalFilename ?? ""),
  ]);
  sendData(res, { batch, rowErrors, sourceColumns });
}

export async function create(
  req: Request<Record<string, never>, unknown, CreateBatchInput>,
  res: Response,
) {
  if (!req.file) throw ApiError.badRequest("A CSV or Excel file is required");
  if (!IMPORT_ACCEPTED_FILE_EXTENSIONS.some((ext) => req.file!.originalname.toLowerCase().endsWith(ext))) {
    throw ApiError.badRequest(`File must be one of: ${IMPORT_ACCEPTED_FILE_EXTENSIONS.join(", ")}`);
  }
  const institutionId = req.user!.institutionId;
  const { sourceSystem } = req.body;

  const { headers, rows } = await parseUploadedFile(req.file.buffer, req.file.originalname);

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

  const { headers } = await parseUploadedFile(
    await importStorage.load(batch.fileReference),
    batch.originalFilename ?? "",
  );
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
  if (importsEnrollments(columnMapping)) {
    const missingEnrollmentRequired = IMPORT_REQUIRED_ENROLLMENT_TARGET_FIELDS.filter(
      (f) => !mappedTargets.has(f),
    );
    if (missingEnrollmentRequired.length > 0) {
      throw ApiError.badRequest(
        `Mapping an enrollment field requires all of ${IMPORT_REQUIRED_ENROLLMENT_TARGET_FIELDS.join(", ")} — missing: ${missingEnrollmentRequired.join(", ")}`,
      );
    }
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
  const enrollmentImport = importsEnrollments(mapping);
  const { headers, rows } = await parseUploadedFile(
    await importStorage.load(batch.fileReference),
    batch.originalFilename ?? "",
  );
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

  const programCodes = [...new Set(candidates.map((c) => c.programCode).filter((v): v is string => !!v))];
  const programsByCode = new Map(
    (
      await prisma.program.findMany({
        where: { institutionId, code: { in: programCodes } },
        select: { id: true, code: true },
      })
    ).map((p) => [p.code, p]),
  );

  const seenIds = new Map<string, number>();
  const rowErrorsToCreate: { rowNumber: number; errorMessage: string; rawRowData: Record<string, string> }[] = [];
  let validCount = 0;

  candidates.forEach((candidate, i) => {
    const rowNumber = i + 1;
    const issues: string[] = [];

    const parsedStudent = createStudentSchema.safeParse(candidate);
    if (!parsedStudent.success) issues.push(...parsedStudent.error.issues.map((issue) => issue.message));

    if (enrollmentImport) {
      const parsedEnrollment = importEnrollmentSchema.safeParse(candidate);
      if (!parsedEnrollment.success) {
        issues.push(...parsedEnrollment.error.issues.map((issue) => issue.message));
      } else if (!programsByCode.has(parsedEnrollment.data.programCode)) {
        issues.push(`Program code "${parsedEnrollment.data.programCode}" not found`);
      }
    }

    if (candidate.internalStudentId) {
      // With enrollment fields mapped, an existing student is the expected,
      // common case (a returning student re-appearing in a later term's
      // export) — not an error, since the whole point is to attach a new
      // enrollment to them. Without enrollment fields, this is still a pure
      // roster import and an existing id is a duplicate, exactly as before.
      if (existingIds.has(candidate.internalStudentId) && !enrollmentImport) {
        issues.push(`Student ID "${candidate.internalStudentId}" already exists`);
      }
      const firstSeenRow = seenIds.get(candidate.internalStudentId);
      if (firstSeenRow === undefined) {
        seenIds.set(candidate.internalStudentId, rowNumber);
      } else if (!enrollmentImport) {
        // Repeated ids across rows are normal for an enrollment import if a
        // source file legitimately lists an incidental duplicate line for a
        // student — but that's indistinguishable from a real data error, so
        // the same-file dedup check only applies to the plain roster mode.
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

async function loadValidCandidates(batch: { id: number; fileReference: string; columnMapping: unknown; originalFilename: string | null }) {
  const mapping = batch.columnMapping as ImportColumnMapping;
  const { headers, rows } = await parseUploadedFile(
    await importStorage.load(batch.fileReference),
    batch.originalFilename ?? "",
  );
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

  const mapping = batch.columnMapping as ImportColumnMapping;
  const enrollmentImport = importsEnrollments(mapping);
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

  let importedEnrollmentCount: number | undefined;

  if (enrollmentImport) {
    const rowsWithProgram = validRows.filter((r) => r.candidate.programCode);

    const [students, programs] = await Promise.all([
      prisma.student.findMany({
        where: {
          institutionId,
          internalStudentId: { in: rowsWithProgram.map((r) => r.candidate.internalStudentId!) },
        },
        select: { id: true, internalStudentId: true },
      }),
      prisma.program.findMany({
        where: {
          institutionId,
          code: { in: [...new Set(rowsWithProgram.map((r) => r.candidate.programCode!))] },
        },
        select: { id: true, code: true, campusId: true },
      }),
    ]);
    const studentIdByInternalId = new Map(students.map((s) => [s.internalStudentId, s.id]));
    const programByCode = new Map(programs.map((p) => [p.code, p]));

    const candidateEnrollments = rowsWithProgram
      .map((r) => {
        const studentId = studentIdByInternalId.get(r.candidate.internalStudentId!);
        const program = programByCode.get(r.candidate.programCode!);
        if (!studentId || !program) return null;
        return {
          studentId,
          programId: program.id,
          campusId: program.campusId,
          startDate: new Date(r.candidate.startDate!),
          // Re-normalized rather than cast directly: the raw candidate value
          // is whatever the file actually contained (e.g. "Active"), and
          // only importEnrollmentSchema — run during validateBatch(), not
          // re-run here — maps that to the real enum spelling. Rows that
          // wouldn't resolve were already excluded via ImportRowError.
          enrollmentStatus: ENROLLMENT_STATUS_LOOKUP.get(r.candidate.enrollmentStatus!.trim().toLowerCase())!,
          expectedCompletionDate: r.candidate.expectedCompletionDate
            ? new Date(r.candidate.expectedCompletionDate)
            : undefined,
          actualCompletionDate: r.candidate.actualCompletionDate
            ? new Date(r.candidate.actualCompletionDate)
            : undefined,
          credentialEarned: r.candidate.credentialEarned,
          enrollmentObjective: r.candidate.enrollmentObjective,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // Idempotency for a re-run of the same (or an overlapping) file: skip a
    // candidate that already matches an existing enrollment's (student,
    // program, start date) triple, the same identity a real duplicate
    // enrollment would share, rather than creating a second copy of it.
    const existingTriples = new Set(
      (
        await prisma.studentEnrollment.findMany({
          where: {
            studentId: { in: [...new Set(candidateEnrollments.map((e) => e.studentId))] },
            programId: { in: [...new Set(candidateEnrollments.map((e) => e.programId))] },
          },
          select: { studentId: true, programId: true, startDate: true },
        })
      ).map((e) => `${e.studentId}-${e.programId}-${e.startDate.toISOString().slice(0, 10)}`),
    );
    const newEnrollments = candidateEnrollments.filter(
      (e) => !existingTriples.has(`${e.studentId}-${e.programId}-${e.startDate.toISOString().slice(0, 10)}`),
    );

    const createdEnrollments =
      newEnrollments.length > 0
        ? await prisma.studentEnrollment.createMany({ data: newEnrollments })
        : { count: 0 };
    importedEnrollmentCount = createdEnrollments.count;
  }

  const updated = await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: "IMPORTED", importedRowCount: created.count, importedEnrollmentCount },
  });

  sendData(res, { batch: updated, importedRowCount: created.count, importedEnrollmentCount });
}
