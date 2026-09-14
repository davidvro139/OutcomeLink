import type { Request, Response } from "express";
import {
  AVAILABILITY_STATUSES,
  CONTINUING_EDUCATION_STATUSES,
  EMPLOYMENT_STATUSES,
  MILITARY_STATUSES,
} from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

/**
 * `completionClassification` here is the institution's own descriptive note —
 * it is NOT what the accreditation engine uses to classify the student for
 * CPL purposes. The classifier (server/src/modules/accreditation/classifiers)
 * derives that from StudentEnrollment.enrollmentStatus instead, per spec §3's
 * "records -> classifications" separation. Keeping a human-entered field here
 * too matches spec §7's listed fields, but it's advisory, not authoritative.
 */
export const createOutcomeRecordSchema = z.object({
  reportingPeriodId: z.coerce.number().int().positive(),
  completionClassification: z.string().trim().max(200).optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  employerId: z.coerce.number().int().positive().optional(),
  jobTitle: z.string().trim().max(200).optional(),
  employmentStartDate: z.coerce.date().optional(),
  relatedToTraining: z.boolean().optional(),
  relatedToTrainingJustification: z.string().trim().max(2000).optional(),
  continuingEducationStatus: z.enum(CONTINUING_EDUCATION_STATUSES).optional(),
  militaryStatus: z.enum(MILITARY_STATUSES).optional(),
  availabilityForEmploymentStatus: z.enum(AVAILABILITY_STATUSES).optional(),
  licensureRequired: z.boolean().default(false),
  verificationStatus: z.string().trim().max(100).optional(),
  verificationMethod: z.string().trim().max(100).optional(),
  verifiedBy: z.string().trim().max(200).optional(),
  verificationDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});
type CreateOutcomeRecordInput = z.infer<typeof createOutcomeRecordSchema>;

export const updateOutcomeRecordSchema = createOutcomeRecordSchema.partial();
type UpdateOutcomeRecordInput = z.infer<typeof updateOutcomeRecordSchema>;

async function findOwnedEnrollment(institutionId: number, studentId: number, enrollmentId: number) {
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { id: enrollmentId, studentId, student: { institutionId } },
  });
  if (!enrollment) throw ApiError.notFound("Enrollment not found");
  return enrollment;
}

async function findOwnedReportingPeriod(institutionId: number, reportingPeriodId: number) {
  const period = await prisma.reportingPeriod.findFirst({
    where: { id: reportingPeriodId, institutionId },
  });
  if (!period) throw ApiError.badRequest("Unknown reportingPeriodId");
  return period;
}

export async function list(req: Request, res: Response) {
  const studentId = Number(req.params.studentId);
  const enrollmentId = Number(req.params.enrollmentId);
  await findOwnedEnrollment(req.user!.institutionId, studentId, enrollmentId);

  const outcomeRecords = await prisma.studentOutcomeRecord.findMany({
    where: { studentEnrollmentId: enrollmentId },
    orderBy: { id: "desc" },
  });
  sendData(res, { outcomeRecords });
}

export async function create(
  req: Request<{ studentId: string; enrollmentId: string }, unknown, CreateOutcomeRecordInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const enrollmentId = Number(req.params.enrollmentId);
  const institutionId = req.user!.institutionId;
  await findOwnedEnrollment(institutionId, studentId, enrollmentId);

  const reportingPeriodId = Number(req.body.reportingPeriodId);
  await findOwnedReportingPeriod(institutionId, reportingPeriodId);

  const existing = await prisma.studentOutcomeRecord.findFirst({
    where: { studentEnrollmentId: enrollmentId, reportingPeriodId },
  });
  if (existing)
    throw ApiError.conflict(
      "An outcome record already exists for this enrollment and reporting period",
    );

  if (req.body.employerId) {
    const employer = await prisma.employer.findFirst({
      where: { id: req.body.employerId, institutionId },
    });
    if (!employer) throw ApiError.badRequest("Unknown employerId");
  }

  const outcomeRecord = await prisma.studentOutcomeRecord.create({
    data: { ...req.body, studentEnrollmentId: enrollmentId, reportingPeriodId },
  });
  sendData(res, { outcomeRecord }, 201);
}

export async function update(
  req: Request<
    { studentId: string; enrollmentId: string; id: string },
    unknown,
    UpdateOutcomeRecordInput
  >,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const enrollmentId = Number(req.params.enrollmentId);
  const id = Number(req.params.id);
  await findOwnedEnrollment(req.user!.institutionId, studentId, enrollmentId);

  const existing = await prisma.studentOutcomeRecord.findFirst({
    where: { id, studentEnrollmentId: enrollmentId },
  });
  if (!existing) throw ApiError.notFound("Outcome record not found");

  const outcomeRecord = await prisma.studentOutcomeRecord.update({ where: { id }, data: req.body });
  sendData(res, { outcomeRecord });
}
