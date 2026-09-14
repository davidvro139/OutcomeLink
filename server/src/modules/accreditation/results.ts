import type { Request, Response } from "express";
import { CPL_METRICS } from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { computeReportingPeriod } from "./calculators/cplCalculator";
import { assertPeriodIsEditable } from "./reportingPeriods";

async function findOwnedPeriod(institutionId: number, reportingPeriodId: number) {
  const period = await prisma.reportingPeriod.findFirst({
    where: { id: reportingPeriodId, institutionId },
  });
  if (!period) throw ApiError.notFound("Reporting period not found");
  return period;
}

export async function compute(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);
  await assertPeriodIsEditable(reportingPeriodId);
  await computeReportingPeriod(reportingPeriodId);
  sendData(res, { computed: true });
}

export const listResultsQuerySchema = z.object({
  programId: z.coerce.number().int().positive().optional(),
});

export async function listResults(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);
  const { programId } = req.query as unknown as z.infer<typeof listResultsQuerySchema>;

  const results = await prisma.cplCalculationResult.findMany({
    where: { reportingPeriodId, programId },
    include: { program: { select: { id: true, name: true } } },
    orderBy: [{ programId: "asc" }, { metric: "asc" }],
  });
  sendData(res, { results });
}

export const drillDownQuerySchema = z.object({
  metric: z.enum(CPL_METRICS),
  programId: z.coerce.number().int().positive().optional(),
  bucket: z.enum(["numerator", "denominator", "excluded"]),
});
type DrillDownQuery = z.infer<typeof drillDownQuerySchema>;

/** Spec §20: every metric must be drillable down to the students behind it and why. */
export async function drillDown(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);
  const { metric, programId, bucket } = req.query as unknown as DrillDownQuery;

  const bucketFilter =
    bucket === "numerator"
      ? { countsInNumerator: true }
      : bucket === "denominator"
        ? { countsInDenominator: true }
        : { countsInNumerator: false, countsInDenominator: false };

  const classifications = await prisma.studentClassification.findMany({
    where: {
      reportingPeriodId,
      metric,
      explanation: bucketFilter,
      studentEnrollment: { programId },
    },
    include: {
      explanation: true,
      studentEnrollment: {
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          program: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  sendData(res, {
    students: classifications.map((c) => ({
      student: c.studentEnrollment.student,
      program: c.studentEnrollment.program,
      classificationCode: c.classificationCode,
      reasonText: c.explanation?.reasonText ?? null,
    })),
  });
}

/** Backs the "How This Student Counts" panel — spec §19. */
export async function studentExplanation(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  const enrollmentId = Number(req.params.enrollmentId);
  await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { id: enrollmentId, student: { institutionId: req.user!.institutionId } },
  });
  if (!enrollment) throw ApiError.notFound("Enrollment not found");

  const classifications = await prisma.studentClassification.findMany({
    where: { reportingPeriodId, studentEnrollmentId: enrollmentId },
    include: { explanation: true },
    orderBy: { metric: "asc" },
  });

  sendData(res, {
    classifications: classifications.map((c) => ({
      metric: c.metric,
      classificationCode: c.classificationCode,
      countsInNumerator: c.explanation?.countsInNumerator ?? false,
      countsInDenominator: c.explanation?.countsInDenominator ?? false,
      reasonText: c.explanation?.reasonText ?? null,
    })),
  });
}
