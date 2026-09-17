import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { recordCommunicationEvent } from "../../lib/communicationEvents";
import { prisma } from "../../lib/prisma";

export const createEmployerSurveySchema = z.object({
  employerId: z.coerce.number().int().positive(),
});
type CreateEmployerSurveyInput = z.infer<typeof createEmployerSurveySchema>;

async function findOwnedStudent(institutionId: number, studentId: number) {
  const student = await prisma.student.findFirst({ where: { id: studentId, institutionId } });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

export async function list(req: Request, res: Response) {
  const studentId = Number(req.params.studentId);
  await findOwnedStudent(req.user!.institutionId, studentId);

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
  await findOwnedStudent(institutionId, studentId);

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
  await recordCommunicationEvent({
    studentId,
    eventType: "EMPLOYER_SURVEY_SENT",
    sourceId: survey.id,
    occurredAt: survey.sentAt,
    summaryText: `Employer survey sent to ${employer.name}`,
  });
  sendData(res, { survey }, 201);
}
