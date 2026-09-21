import type { Request, Response } from "express";
import { z } from "zod";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const createEmploymentRecordSchema = z.object({
  employerId: z.coerce.number().int().positive(),
  jobTitle: z.string().trim().min(1).max(200),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  fullTime: z.boolean(),
  relatedToTraining: z.boolean(),
  relationshipDeterminationMethod: z.string().trim().max(500).optional(),
  salaryOrWage: z.coerce.number().positive().optional(),
  employmentStatus: z.string().trim().min(1).max(100),
  verificationStatus: z.string().trim().max(100).optional(),
  verificationDate: z.coerce.date().optional(),
  verificationSource: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(5000).optional(),
});
type CreateEmploymentRecordInput = z.infer<typeof createEmploymentRecordSchema>;

// Historical employment records are preserved, not overwritten (spec §8) — this
// update is for correcting/verifying an existing record's own fields, not for
// recording a job change, which should be a new record via create() instead.
export const updateEmploymentRecordSchema = createEmploymentRecordSchema.partial();
type UpdateEmploymentRecordInput = z.infer<typeof updateEmploymentRecordSchema>;

async function findOwnedStudent(
  institutionId: number,
  studentId: number,
  accessibleProgramIds: number[] | null,
) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId, ...studentProgramScopeFilter(accessibleProgramIds) },
  });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

export async function list(req: Request, res: Response) {
  const studentId = Number(req.params.studentId);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  await findOwnedStudent(req.user!.institutionId, studentId, accessibleProgramIds);
  const employmentRecords = await prisma.employmentRecord.findMany({
    where: { studentId },
    orderBy: { startDate: "desc" },
    include: { employer: true },
  });
  sendData(res, { employmentRecords });
}

export async function create(
  req: Request<{ studentId: string }, unknown, CreateEmploymentRecordInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const institutionId = req.user!.institutionId;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  await findOwnedStudent(institutionId, studentId, accessibleProgramIds);

  const employer = await prisma.employer.findFirst({
    where: { id: req.body.employerId, institutionId },
  });
  if (!employer) throw ApiError.badRequest("Unknown employerId");

  const employmentRecord = await prisma.employmentRecord.create({
    data: { ...req.body, studentId },
  });
  sendData(res, { employmentRecord }, 201);
}

export async function update(
  req: Request<{ studentId: string; id: string }, unknown, UpdateEmploymentRecordInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const id = Number(req.params.id);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  await findOwnedStudent(req.user!.institutionId, studentId, accessibleProgramIds);

  const existing = await prisma.employmentRecord.findFirst({ where: { id, studentId } });
  if (!existing) throw ApiError.notFound("Employment record not found");

  const employmentRecord = await prisma.employmentRecord.update({ where: { id }, data: req.body });
  sendData(res, { employmentRecord });
}
