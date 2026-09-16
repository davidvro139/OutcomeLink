import type {
  AvailabilityStatus,
  ContinuingEducationStatus,
  CplMetric,
  EmploymentStatus,
  MilitaryStatus,
} from "@outcomelink/shared";
import { prisma } from "../../../lib/prisma";
import { coe2026Classifier } from "../classifiers/coe2026";
import type { ClassifierContext } from "../classifiers/types";

interface MetricTally {
  metric: CplMetric;
  numerator: boolean;
  denominator: boolean;
}

/**
 * Runs the classifier over every enrollment in the institution for one
 * reporting period, persists a StudentClassification + explanation per
 * (enrollment, metric) — including NOT_APPLICABLE ones, since "why doesn't
 * this student count" is exactly what spec §19's explanation panel needs to
 * answer — then aggregates into per-program and institution-wide
 * CplCalculationResult rows.
 *
 * Not yet covered (see docs/TODO.md): re-running this for a Finalized
 * reporting period, and any notion of partial/incremental recomputation —
 * this always recomputes every enrollment from scratch.
 */
export async function computeReportingPeriod(reportingPeriodId: number): Promise<void> {
  const reportingPeriod = await prisma.reportingPeriod.findUniqueOrThrow({
    where: { id: reportingPeriodId },
  });

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { student: { institutionId: reportingPeriod.institutionId } },
  });

  const tallyByProgram = new Map<number, MetricTally[]>();

  for (const enrollment of enrollments) {
    const outcomeRecord = await prisma.studentOutcomeRecord.findFirst({
      where: { studentEnrollmentId: enrollment.id, reportingPeriodId },
    });

    const licensureResult = outcomeRecord?.licensureRequired
      ? await prisma.licensureResult.findFirst({
          where: { studentId: enrollment.studentId, programId: enrollment.programId },
          orderBy: { attemptNumber: "desc" },
        })
      : null;

    const context: ClassifierContext = {
      enrollment: {
        enrollmentStatus: enrollment.enrollmentStatus,
        actualCompletionDate: enrollment.actualCompletionDate,
        allowableSubtractionReason: enrollment.allowableSubtractionReason,
        reportableForAccreditation: enrollment.reportableForAccreditation,
        enrollmentObjective: enrollment.enrollmentObjective,
      },
      reportingPeriod: { startDate: reportingPeriod.startDate, endDate: reportingPeriod.endDate },
      outcomeRecord: outcomeRecord
        ? {
            employmentStatus: outcomeRecord.employmentStatus as EmploymentStatus | null,
            relatedToTraining: outcomeRecord.relatedToTraining,
            continuingEducationStatus:
              outcomeRecord.continuingEducationStatus as ContinuingEducationStatus | null,
            militaryStatus: outcomeRecord.militaryStatus as MilitaryStatus | null,
            availabilityForEmploymentStatus:
              outcomeRecord.availabilityForEmploymentStatus as AvailabilityStatus | null,
            licensureRequired: outcomeRecord.licensureRequired,
          }
        : null,
      licensureResult: licensureResult ? { result: licensureResult.result } : null,
    };

    const results = coe2026Classifier.classify(context);
    const tally = tallyByProgram.get(enrollment.programId) ?? [];

    for (const result of results) {
      const classification = await prisma.studentClassification.upsert({
        where: {
          studentEnrollmentId_reportingPeriodId_metric: {
            studentEnrollmentId: enrollment.id,
            reportingPeriodId,
            metric: result.metric,
          },
        },
        create: {
          studentEnrollmentId: enrollment.id,
          reportingPeriodId,
          metric: result.metric,
          classificationCode: result.classificationCode,
          determinedByRuleSetId: reportingPeriod.ruleSetId,
        },
        update: {
          classificationCode: result.classificationCode,
          determinedByRuleSetId: reportingPeriod.ruleSetId,
          computedAt: new Date(),
        },
      });

      await prisma.cplCalculationExplanation.upsert({
        where: { studentClassificationId: classification.id },
        create: {
          studentClassificationId: classification.id,
          countsInNumerator: result.countsInNumerator,
          countsInDenominator: result.countsInDenominator,
          reasonText: result.reasonText,
        },
        update: {
          countsInNumerator: result.countsInNumerator,
          countsInDenominator: result.countsInDenominator,
          reasonText: result.reasonText,
        },
      });

      tally.push({
        metric: result.metric,
        numerator: result.countsInNumerator,
        denominator: result.countsInDenominator,
      });
    }

    tallyByProgram.set(enrollment.programId, tally);
  }

  const metrics: CplMetric[] = ["COMPLETION", "PLACEMENT", "LICENSURE"];
  for (const metric of metrics) {
    let institutionNumerator = 0;
    let institutionDenominator = 0;

    for (const [programId, tally] of tallyByProgram) {
      const forMetric = tally.filter((t) => t.metric === metric);
      const numerator = forMetric.filter((t) => t.numerator).length;
      const denominator = forMetric.filter((t) => t.denominator).length;
      institutionNumerator += numerator;
      institutionDenominator += denominator;
      await upsertCplResult(programId, reportingPeriodId, metric, numerator, denominator);
    }

    await upsertCplResult(
      null,
      reportingPeriodId,
      metric,
      institutionNumerator,
      institutionDenominator,
    );
  }
}

/**
 * Not a plain prisma.upsert(): Prisma's typed compound-unique `where` input
 * doesn't accept `null` for a nullable field in the key (a known Prisma
 * limitation), and `programId: null` is exactly the institution-wide rollup
 * case here. Doing the find-then-write manually sidesteps that.
 */
async function upsertCplResult(
  programId: number | null,
  reportingPeriodId: number,
  metric: CplMetric,
  numerator: number,
  denominator: number,
) {
  const percentage = denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
  const existing = await prisma.cplCalculationResult.findFirst({
    where: { programId, reportingPeriodId, metric },
  });

  if (existing) {
    await prisma.cplCalculationResult.update({
      where: { id: existing.id },
      data: { numerator, denominator, percentage, computedAt: new Date() },
    });
  } else {
    await prisma.cplCalculationResult.create({
      data: { programId, reportingPeriodId, metric, numerator, denominator, percentage },
    });
  }
}
