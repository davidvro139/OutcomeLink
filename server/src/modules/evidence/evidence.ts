import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { EVIDENCE_TYPES } from "@outcomelink/shared";
import multer from "multer";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { storage } from "../../lib/storage";

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

export const createEvidenceSchema = z.object({
  evidenceType: z.enum(EVIDENCE_TYPES),
  description: z.string().trim().max(2000).optional(),
  outcomeRecordId: z.coerce.number().int().positive().optional(),
  employmentRecordId: z.coerce.number().int().positive().optional(),
  licensureResultId: z.coerce.number().int().positive().optional(),
});
type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;

interface EvidenceTarget {
  outcomeRecordId?: number;
  employmentRecordId?: number;
  licensureResultId?: number;
}

/** The same "exactly one target" invariant the CHECK constraints enforce at the database level (docs/DATA_MODEL.md §13). */
function assertExactlyOneTarget(target: EvidenceTarget) {
  const count = [
    target.outcomeRecordId,
    target.employmentRecordId,
    target.licensureResultId,
  ].filter((id) => id !== undefined).length;
  if (count !== 1) {
    throw ApiError.badRequest(
      "Exactly one of outcomeRecordId, employmentRecordId, or licensureResultId is required",
    );
  }
}

async function assertTargetInInstitution(institutionId: number, target: EvidenceTarget) {
  if (target.outcomeRecordId) {
    const record = await prisma.studentOutcomeRecord.findFirst({
      where: { id: target.outcomeRecordId, studentEnrollment: { student: { institutionId } } },
    });
    if (!record) throw ApiError.badRequest("Unknown outcomeRecordId");
  } else if (target.employmentRecordId) {
    const record = await prisma.employmentRecord.findFirst({
      where: { id: target.employmentRecordId, student: { institutionId } },
    });
    if (!record) throw ApiError.badRequest("Unknown employmentRecordId");
  } else if (target.licensureResultId) {
    const record = await prisma.licensureResult.findFirst({
      where: { id: target.licensureResultId, student: { institutionId } },
    });
    if (!record) throw ApiError.badRequest("Unknown licensureResultId");
  }
}

async function findOwnedEvidence(institutionId: number, id: number) {
  const evidence = await prisma.evidence.findFirst({
    where: {
      id,
      OR: [
        { outcomeRecord: { studentEnrollment: { student: { institutionId } } } },
        { employmentRecord: { student: { institutionId } } },
        { licensureResult: { student: { institutionId } } },
      ],
    },
  });
  if (!evidence) throw ApiError.notFound("Evidence not found");
  return evidence;
}

export async function list(req: Request, res: Response) {
  const target: EvidenceTarget = {
    outcomeRecordId: req.query.outcomeRecordId ? Number(req.query.outcomeRecordId) : undefined,
    employmentRecordId: req.query.employmentRecordId
      ? Number(req.query.employmentRecordId)
      : undefined,
    licensureResultId: req.query.licensureResultId
      ? Number(req.query.licensureResultId)
      : undefined,
  };
  assertExactlyOneTarget(target);
  await assertTargetInInstitution(req.user!.institutionId, target);

  const evidence = await prisma.evidence.findMany({
    where: target,
    orderBy: { uploadedAt: "desc" },
  });
  sendData(res, { evidence });
}

export async function create(req: Request<unknown, unknown, CreateEvidenceInput>, res: Response) {
  if (!req.file) throw ApiError.badRequest("A file is required");

  const target: EvidenceTarget = req.body;
  assertExactlyOneTarget(target);
  await assertTargetInInstitution(req.user!.institutionId, target);

  const uploader = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { name: true },
  });
  const { fileReference } = await storage.save({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
  });

  const evidence = await prisma.evidence.create({
    data: {
      evidenceType: req.body.evidenceType,
      description: req.body.description,
      ...target,
      fileReference,
      uploadedBy: uploader?.name ?? String(req.user!.sub),
    },
  });
  sendData(res, { evidence }, 201);
}

export async function download(req: Request, res: Response, next: NextFunction) {
  const evidence = await findOwnedEvidence(req.user!.institutionId, Number(req.params.id));
  const filePath = path.join(process.cwd(), "uploads", "evidence", evidence.fileReference);
  res.sendFile(filePath, (err) => {
    if (err) next(ApiError.notFound("Evidence file not found on disk"));
  });
}
