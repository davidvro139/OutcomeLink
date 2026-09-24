import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { recordCommunicationEvent } from "../../lib/communicationEvents";
import { emailResponseFields } from "../../lib/emailDelivery";
import { prisma } from "../../lib/prisma";
import { emailOutcomeNote, noteworthy, sendEmployerSurveyEmail } from "./surveyEmail";

export const createEmployerSurveySchema = z.object({
  employerId: z.coerce.number().int().positive(),
  /** Which of the employer's contacts to email; omitted = a verification contact, else the primary contact, else any with an address. */
  employerContactId: z.coerce.number().int().positive().optional(),
  /** Set false to only create the link (to pass along yourself). */
  sendEmail: z.boolean().default(true),
});
type CreateEmployerSurveyInput = z.infer<typeof createEmployerSurveySchema>;

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

  const surveys = await prisma.employerSurvey.findMany({
    where: { studentId },
    include: { response: true, employer: { select: { id: true, name: true } } },
    orderBy: { sentAt: "desc" },
  });
  sendData(res, { surveys });
}

export async function create(
  req: Request<{ studentId: string }, unknown, CreateEmployerSurveyInput>,
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

  const employmentOnFile = await prisma.employmentRecord.findFirst({
    where: { studentId, employerId: employer.id },
  });
  if (!employmentOnFile) {
    throw ApiError.badRequest("No employment record on file for this student at this employer");
  }

  const survey = await prisma.employerSurvey.create({
    data: {
      studentId,
      employerId: employer.id,
      sentAt: new Date(),
      responseToken: randomUUID(),
    },
  });
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { firstName: true, lastName: true } });
  const outcome = req.body.sendEmail
    ? await sendEmployerSurveyEmail(
        institutionId,
        survey,
        employer.id,
        `${student.firstName} ${student.lastName}`,
        req.body.employerContactId,
      )
    : null;
  const noted = noteworthy(outcome);
  await recordCommunicationEvent({
    studentId,
    eventType: "EMPLOYER_SURVEY_SENT",
    sourceId: survey.id,
    occurredAt: survey.sentAt,
    summaryText: `Employer survey ${noted ? (noted.status === "SENT" ? "sent" : "created") : "sent"} ${noted ? "for" : "to"} ${employer.name}${noted ? ` — ${emailOutcomeNote(noted)}` : ""}`,
  });
  sendData(res, { survey, ...(outcome ? emailResponseFields(outcome) : {}) }, 201);
}
