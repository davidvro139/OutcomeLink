import type { Request, Response } from "express";
import { FOLLOW_UP_METHODS, FOLLOW_UP_OUTCOMES } from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const createFollowUpAttemptSchema = z.object({
  attemptedAt: z.coerce.date(),
  method: z.enum(FOLLOW_UP_METHODS),
  outcome: z.enum(FOLLOW_UP_OUTCOMES),
  notes: z.string().trim().max(5000).optional(),
  nextFollowUpDate: z.coerce.date().optional(),
});
type CreateFollowUpAttemptInput = z.infer<typeof createFollowUpAttemptSchema>;

async function findOwnedStudent(institutionId: number, studentId: number) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    include: { communicationPreference: true },
  });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

export async function list(req: Request, res: Response) {
  const studentId = Number(req.params.studentId);
  await findOwnedStudent(req.user!.institutionId, studentId);
  const followUpAttempts = await prisma.followUpAttempt.findMany({
    where: { studentId },
    orderBy: { attemptedAt: "desc" },
    include: { staffUser: { select: { id: true, name: true } } },
  });
  sendData(res, { followUpAttempts });
}

export async function create(
  req: Request<{ studentId: string }, unknown, CreateFollowUpAttemptInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const student = await findOwnedStudent(req.user!.institutionId, studentId);

  // Consent enforcement (spec §11): a contact method the student opted out of
  // shouldn't be used. We record what actually happened rather than silently
  // block it — staff may need to log a call that already took place — but
  // refuse the one case that's unambiguous: attempting a student who is
  // flagged do-not-contact at all.
  if (student.communicationPreference?.doNotContact) {
    throw ApiError.conflict("This student is flagged do-not-contact");
  }

  const followUpAttempt = await prisma.followUpAttempt.create({
    data: { ...req.body, studentId, staffUserId: req.user!.sub },
  });
  sendData(res, { followUpAttempt }, 201);
}
