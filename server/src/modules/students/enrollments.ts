import type { Request, Response } from "express";
import { ENROLLMENT_STATUSES } from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const createEnrollmentSchema = z.object({
  programId: z.coerce.number().int().positive(),
  campusId: z.coerce.number().int().positive(),
  cohortId: z.coerce.number().int().positive().optional(),
  startDate: z.coerce.date(),
  expectedCompletionDate: z.coerce.date().optional(),
  actualCompletionDate: z.coerce.date().optional(),
  enrollmentStatus: z.enum(ENROLLMENT_STATUSES),
  credentialEarned: z.string().trim().max(200).optional(),
  exitReason: z.string().trim().max(500).optional(),
});
type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;

export const updateEnrollmentSchema = createEnrollmentSchema.partial();
type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;

async function findOwnedStudent(institutionId: number, studentId: number) {
  const student = await prisma.student.findFirst({ where: { id: studentId, institutionId } });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

export async function list(req: Request, res: Response) {
  const studentId = Number(req.params.studentId);
  await findOwnedStudent(req.user!.institutionId, studentId);
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { studentId },
    orderBy: { startDate: "desc" },
  });
  sendData(res, { enrollments });
}

export async function create(
  req: Request<{ studentId: string }, unknown, CreateEnrollmentInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  await findOwnedStudent(req.user!.institutionId, studentId);
  const enrollment = await prisma.studentEnrollment.create({ data: { ...req.body, studentId } });
  sendData(res, { enrollment }, 201);
}

export async function update(
  req: Request<{ studentId: string; id: string }, unknown, UpdateEnrollmentInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const id = Number(req.params.id);
  await findOwnedStudent(req.user!.institutionId, studentId);

  const existing = await prisma.studentEnrollment.findFirst({ where: { id, studentId } });
  if (!existing) throw ApiError.notFound("Enrollment not found");

  const enrollment = await prisma.studentEnrollment.update({ where: { id }, data: req.body });
  sendData(res, { enrollment });
}
