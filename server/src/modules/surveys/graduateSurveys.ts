import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { recordCommunicationEvent } from "../../lib/communicationEvents";
<<<<<<< HEAD
import { prisma } from "../../lib/prisma";
=======
import { emailResponseFields, studentEmailTarget, type EmailOutcome } from "../../lib/emailDelivery";
import { prisma } from "../../lib/prisma";
import { emailOutcomeNote, noteworthy, sendGraduateSurveyEmail } from "./surveyEmail";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

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

<<<<<<< HEAD
=======
  // Only the EMAIL channel is actually delivered; the other channels (SMS,
  // MAIL, PHONE) still just create a link for staff to pass along.
  const viaEmail = req.body.channel?.toUpperCase() === "EMAIL";
  if (viaEmail) {
    const target = await studentEmailTarget(studentId);
    if ("skipped" in target && target.skipped === "Flagged do-not-contact") {
      throw ApiError.conflict("Student is flagged do-not-contact");
    }
  }

>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  const survey = await prisma.graduateSurvey.create({
    data: {
      studentId,
      sentAt: new Date(),
      channel: req.body.channel,
      responseToken: randomUUID(),
    },
  });
<<<<<<< HEAD
=======
  const outcome: EmailOutcome | null = viaEmail
    ? await sendGraduateSurveyEmail(req.user!.institutionId, survey)
    : null;
  const noted = noteworthy(outcome);
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  await recordCommunicationEvent({
    studentId,
    eventType: "GRADUATE_SURVEY_SENT",
    sourceId: survey.id,
    occurredAt: survey.sentAt,
<<<<<<< HEAD
    summaryText: `Graduate survey sent${survey.channel ? ` via ${survey.channel}` : ""}`,
  });
  sendData(res, { survey }, 201);
=======
    summaryText: `Graduate survey ${noted ? "created" : "sent"}${survey.channel ? ` via ${survey.channel}` : ""}${noted ? ` — ${emailOutcomeNote(noted)}` : ""}`,
  });
  sendData(res, { survey, ...(outcome ? emailResponseFields(outcome) : {}) }, 201);
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}
