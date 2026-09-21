import type { Request, Response } from "express";
import { FOLLOW_UP_METHODS } from "@outcomelink/shared";
import { z } from "zod";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const upsertCommunicationPreferenceSchema = z.object({
  preferredContactMethod: z.enum(FOLLOW_UP_METHODS).optional(),
  smsConsentStatus: z.boolean().optional(),
  smsConsentDate: z.coerce.date().optional(),
  doNotContact: z.boolean().default(false),
  doNotContactReason: z.string().trim().max(1000).optional(),
});
type UpsertCommunicationPreferenceInput = z.infer<typeof upsertCommunicationPreferenceSchema>;

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
  const preference = await prisma.studentCommunicationPreference.findUnique({
    where: { studentId },
  });
  sendData(res, { preference });
}

export async function upsert(
  req: Request<{ studentId: string }, unknown, UpsertCommunicationPreferenceInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  await findOwnedStudent(req.user!.institutionId, studentId, accessibleProgramIds);

  const preference = await prisma.studentCommunicationPreference.upsert({
    where: { studentId },
    create: { ...req.body, studentId },
    update: req.body,
  });
  sendData(res, { preference });
}
