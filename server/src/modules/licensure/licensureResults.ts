import type { Request, Response } from "express";
import { LICENSURE_RESULT_STATUSES } from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const createLicensureResultSchema = z.object({
  programId: z.coerce.number().int().positive(),
  examName: z.string().trim().min(1).max(200),
  scheduledDate: z.coerce.date().optional(),
  examDate: z.coerce.date().optional(),
  result: z.enum(LICENSURE_RESULT_STATUSES),
  // Auto-assigned from the student+program's existing attempt count when omitted.
  attemptNumber: z.coerce.number().int().positive().optional(),
});
type CreateLicensureResultInput = z.infer<typeof createLicensureResultSchema>;

export const updateLicensureResultSchema = createLicensureResultSchema.partial();
type UpdateLicensureResultInput = z.infer<typeof updateLicensureResultSchema>;

async function findOwnedStudent(institutionId: number, studentId: number) {
  const student = await prisma.student.findFirst({ where: { id: studentId, institutionId } });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

export async function list(req: Request, res: Response) {
  const studentId = Number(req.params.studentId);
  await findOwnedStudent(req.user!.institutionId, studentId);
  const licensureResults = await prisma.licensureResult.findMany({
    where: { studentId },
    orderBy: [{ programId: "asc" }, { attemptNumber: "asc" }],
    include: { program: { select: { id: true, name: true } } },
  });
  sendData(res, { licensureResults });
}

export async function create(
  req: Request<{ studentId: string }, unknown, CreateLicensureResultInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const institutionId = req.user!.institutionId;
  await findOwnedStudent(institutionId, studentId);

  const program = await prisma.program.findFirst({
    where: { id: req.body.programId, institutionId },
  });
  if (!program) throw ApiError.badRequest("Unknown programId");

  const attemptNumber =
    req.body.attemptNumber ??
    (await prisma.licensureResult.count({
      where: { studentId, programId: req.body.programId },
    })) + 1;

  const licensureResult = await prisma.licensureResult.create({
    data: { ...req.body, studentId, attemptNumber },
  });
  sendData(res, { licensureResult }, 201);
}

export async function update(
  req: Request<{ studentId: string; id: string }, unknown, UpdateLicensureResultInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const id = Number(req.params.id);
  await findOwnedStudent(req.user!.institutionId, studentId);

  const existing = await prisma.licensureResult.findFirst({ where: { id, studentId } });
  if (!existing) throw ApiError.notFound("Licensure result not found");

  const licensureResult = await prisma.licensureResult.update({ where: { id }, data: req.body });
  sendData(res, { licensureResult });
}
