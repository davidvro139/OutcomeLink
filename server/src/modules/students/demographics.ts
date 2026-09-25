import type { Request, Response } from "express";
import { GENDERS, RACE_ETHNICITIES } from "@outcomelink/shared";
import { z } from "zod";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const upsertStudentDemographicsSchema = z.object({
  gender: z.enum(GENDERS).optional().nullable(),
  raceEthnicity: z.enum(RACE_ETHNICITIES).optional().nullable(),
  economicallyDisadvantaged: z.boolean().optional().nullable(),
  firstGenerationStudent: z.boolean().optional().nullable(),
  disabilityStatus: z.boolean().optional().nullable(),
});
type UpsertStudentDemographicsInput = z.infer<typeof upsertStudentDemographicsSchema>;

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

export async function show(req: Request, res: Response) {
  const studentId = Number(req.params.studentId);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  await findOwnedStudent(req.user!.institutionId, studentId, accessibleProgramIds);
  const demographics = await prisma.studentDemographics.findUnique({
    where: { studentId },
  });
  sendData(res, { demographics });
}

export async function upsert(
  req: Request<{ studentId: string }, unknown, UpsertStudentDemographicsInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  await findOwnedStudent(req.user!.institutionId, studentId, accessibleProgramIds);

  const demographics = await prisma.studentDemographics.upsert({
    where: { studentId },
    create: { ...req.body, studentId },
    update: req.body,
  });
  sendData(res, { demographics });
}
