import type { Request, Response } from "express";
import {
  CONTINUING_EDUCATION_STATUSES,
  EMPLOYER_VERIFICATION_RESPONSES,
  EMPLOYMENT_STATUSES,
  GRADUATE_RELATED_TO_TRAINING_RESPONSES,
} from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

/**
 * Unauthenticated by design — a graduate or employer filling out a survey has
 * no OutcomeLink account. Access control is the unguessable `responseToken`
 * in the URL, not a session; see the comment on GraduateSurvey.responseToken
 * in schema.prisma.
 */

const rating = () => z.coerce.number().int().min(1).max(5);

export const graduateSurveyResponseSchema = z.object({
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  employer: z.string().trim().max(200).optional(),
  jobTitle: z.string().trim().max(200).optional(),
  relatedToTrainingResponse: z.enum(GRADUATE_RELATED_TO_TRAINING_RESPONSES).optional(),
  continuingEducation: z.enum(CONTINUING_EDUCATION_STATUSES).optional(),
  satisfactionRating: rating().optional(),
  skillsPreparednessRating: rating().optional(),
  comments: z.string().trim().max(2000).optional(),
});
type GraduateSurveyResponseInput = z.infer<typeof graduateSurveyResponseSchema>;

export const employerSurveyResponseSchema = z.object({
  employmentVerification: z.enum(EMPLOYER_VERIFICATION_RESPONSES).optional(),
  technicalPreparednessRating: rating().optional(),
  communicationRating: rating().optional(),
  problemSolvingRating: rating().optional(),
  professionalismRating: rating().optional(),
  overallSatisfactionRating: rating().optional(),
  skillsGapNotes: z.string().trim().max(2000).optional(),
  likelihoodToHireAgainRating: rating().optional(),
  comments: z.string().trim().max(2000).optional(),
});
type EmployerSurveyResponseInput = z.infer<typeof employerSurveyResponseSchema>;

export async function getGraduateSurvey(req: Request<{ token: string }>, res: Response) {
  const survey = await prisma.graduateSurvey.findUnique({
    where: { responseToken: req.params.token },
    include: { student: { select: { firstName: true, lastName: true } }, response: { select: { id: true } } },
  });
  if (!survey) throw ApiError.notFound("Survey not found");

  sendData(res, {
    studentFirstName: survey.student.firstName,
    studentLastName: survey.student.lastName,
    alreadyResponded: survey.response !== null,
  });
}

export async function submitGraduateSurveyResponse(
  req: Request<{ token: string }, unknown, GraduateSurveyResponseInput>,
  res: Response,
) {
  const survey = await prisma.graduateSurvey.findUnique({
    where: { responseToken: req.params.token },
    include: { response: { select: { id: true } } },
  });
  if (!survey) throw ApiError.notFound("Survey not found");
  if (survey.response) throw ApiError.conflict("This survey has already been responded to");

  const response = await prisma.graduateSurveyResponse.create({
    data: { ...req.body, surveyId: survey.id, submittedAt: new Date() },
  });
  sendData(res, { response }, 201);
}

export async function getEmployerSurvey(req: Request<{ token: string }>, res: Response) {
  const survey = await prisma.employerSurvey.findUnique({
    where: { responseToken: req.params.token },
    include: {
      student: { select: { firstName: true, lastName: true } },
      employer: { select: { name: true } },
      response: { select: { id: true } },
    },
  });
  if (!survey) throw ApiError.notFound("Survey not found");

  sendData(res, {
    studentFirstName: survey.student.firstName,
    studentLastName: survey.student.lastName,
    employerName: survey.employer.name,
    alreadyResponded: survey.response !== null,
  });
}

export async function submitEmployerSurveyResponse(
  req: Request<{ token: string }, unknown, EmployerSurveyResponseInput>,
  res: Response,
) {
  const survey = await prisma.employerSurvey.findUnique({
    where: { responseToken: req.params.token },
    include: { response: { select: { id: true } } },
  });
  if (!survey) throw ApiError.notFound("Survey not found");
  if (survey.response) throw ApiError.conflict("This survey has already been responded to");

  const response = await prisma.employerSurveyResponse.create({
    data: { ...req.body, surveyId: survey.id, submittedAt: new Date() },
  });
  sendData(res, { response }, 201);
}
