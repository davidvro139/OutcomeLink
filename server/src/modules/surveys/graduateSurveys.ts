import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { recordCommunicationEvent } from "../../lib/communicationEvents";
import { prisma } from "../../lib/prisma";

export const createGraduateSurveySchema = z.object({
  channel: z.string().trim().max(100).optional(),
});
type CreateGraduateSurveyInput = z.infer<typeof createGraduateSurveySchema>;

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

  const surveys = await prisma.graduateSurvey.findMany({
    where: { studentId },
    include: { response: true },
    orderBy: { sentAt: "desc" },
  });
  sendData(res, { surveys });
}

export async function create(
  req: Request<{ studentId: string }, unknown, CreateGraduateSurveyInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  await findOwnedStudent(req.user!.institutionId, studentId, accessibleProgramIds);

  const survey = await prisma.graduateSurvey.create({
    data: {
      studentId,
      sentAt: new Date(),
      channel: req.body.channel,
      responseToken: randomUUID(),
    },
  });
  await recordCommunicationEvent({
    studentId,
    eventType: "GRADUATE_SURVEY_SENT",
    sourceId: survey.id,
    occurredAt: survey.sentAt,
    summaryText: `Graduate survey sent${survey.channel ? ` via ${survey.channel}` : ""}`,
  });
  sendData(res, { survey }, 201);
}
