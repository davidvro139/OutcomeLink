import { ValidationSeverity } from "@prisma/client";
import { prisma } from "../../../lib/prisma";

interface Issue {
  studentId?: number;
  programId?: number;
  issueType: string;
  severity: ValidationSeverity;
}

/**
 * Spec §22's validation checks, scoped to what actually maps onto the current
 * schema. NOT implemented: "enrollment totals that do not reconcile" — COE's
 * worksheet reconciles Beginning/New Enrollment against Still Enrolled +
 * Completers + Withdrawals (docs/COE_RULE_MATRIX.md §2), but OutcomeLink
 * tracks continuous per-student enrollments rather than period-bounded
 * enrollment-count snapshots, so there's no honest way to run that specific
 * check without first building an enrollment-ledger concept this schema
 * doesn't have. Flagged here rather than faked.
 */
export async function runValidation(reportingPeriodId: number): Promise<void> {
  const reportingPeriod = await prisma.reportingPeriod.findUniqueOrThrow({
    where: { id: reportingPeriodId },
    include: { ruleSet: true },
  });

  const issues: Issue[] = [];

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { student: { institutionId: reportingPeriod.institutionId } },
    include: {
      student: true,
      outcomeRecords: { where: { reportingPeriodId } },
    },
  });

  const concludedStatuses = ["GRADUATE_COMPLETER", "NON_GRADUATE_COMPLETER", "WITHDRAWN"];

  for (const enrollment of enrollments) {
    if (!concludedStatuses.includes(enrollment.enrollmentStatus)) continue;

    // Missing completion dates
    if (!enrollment.actualCompletionDate) {
      issues.push({
        studentId: enrollment.studentId,
        programId: enrollment.programId,
        issueType: "MISSING_COMPLETION_DATE",
        severity: ValidationSeverity.ERROR,
      });
      continue; // can't tell if this belongs to the period at all without a date
    }

    const inPeriod =
      enrollment.actualCompletionDate >= reportingPeriod.startDate &&
      enrollment.actualCompletionDate <= reportingPeriod.endDate;
    if (!inPeriod) continue;

    const outcome = enrollment.outcomeRecords[0];

    // Missing outcome classification — a completer with nothing on file for this period at all
    if (!outcome) {
      issues.push({
        studentId: enrollment.studentId,
        programId: enrollment.programId,
        issueType: "MISSING_OUTCOME_RECORD",
        severity: ValidationSeverity.ERROR,
      });
      continue;
    }

    // Employment without employer
    if (outcome.employmentStatus === "EMPLOYED" && !outcome.employerId) {
      issues.push({
        studentId: enrollment.studentId,
        programId: enrollment.programId,
        issueType: "EMPLOYMENT_WITHOUT_EMPLOYER",
        severity: ValidationSeverity.WARNING,
      });
    }

    // Related employment without justification
    if (outcome.relatedToTraining === true && !outcome.relatedToTrainingJustification) {
      issues.push({
        studentId: enrollment.studentId,
        programId: enrollment.programId,
        issueType: "RELATED_EMPLOYMENT_WITHOUT_JUSTIFICATION",
        severity: ValidationSeverity.WARNING,
      });
    }

    // Placement without verification
    if (outcome.employmentStatus === "EMPLOYED" && !outcome.verificationStatus) {
      issues.push({
        studentId: enrollment.studentId,
        programId: enrollment.programId,
        issueType: "PLACEMENT_WITHOUT_VERIFICATION",
        severity: ValidationSeverity.WARNING,
      });
    }

    // Verified outcome missing supporting evidence
    if (outcome.verificationStatus && outcome.employmentStatus === "EMPLOYED") {
      const evidenceCount = await prisma.evidence.count({ where: { outcomeRecordId: outcome.id } });
      if (evidenceCount === 0) {
        issues.push({
          studentId: enrollment.studentId,
          programId: enrollment.programId,
          issueType: "MISSING_EVIDENCE",
          severity: ValidationSeverity.WARNING,
        });
      }
    }

    // Missing licensure result
    if (outcome.licensureRequired && enrollment.enrollmentStatus === "GRADUATE_COMPLETER") {
      const licensureResult = await prisma.licensureResult.findFirst({
        where: { studentId: enrollment.studentId, programId: enrollment.programId },
      });
      if (!licensureResult) {
        issues.push({
          studentId: enrollment.studentId,
          programId: enrollment.programId,
          issueType: "MISSING_LICENSURE_RESULT",
          severity: ValidationSeverity.WARNING,
        });
      }
    }

    // Conflicting categories: withdrawn per enrollment status, but the outcome record says employed
    if (enrollment.enrollmentStatus === "WITHDRAWN" && outcome.employmentStatus === "EMPLOYED") {
      issues.push({
        studentId: enrollment.studentId,
        programId: enrollment.programId,
        issueType: "CONFLICTING_WITHDRAWAL_AND_EMPLOYMENT",
        severity: ValidationSeverity.INFORMATION,
      });
    }
  }

  // Duplicate student: same institution, same first+last name, different internal IDs
  const students = await prisma.student.findMany({
    where: { institutionId: reportingPeriod.institutionId },
  });
  const byName = new Map<string, number[]>();
  for (const student of students) {
    const key = `${student.firstName.trim().toLowerCase()}|${student.lastName.trim().toLowerCase()}`;
    byName.set(key, [...(byName.get(key) ?? []), student.id]);
  }
  for (const ids of byName.values()) {
    if (ids.length > 1) {
      for (const studentId of ids) {
        issues.push({
          studentId,
          issueType: "POSSIBLE_DUPLICATE_STUDENT",
          severity: ValidationSeverity.WARNING,
        });
      }
    }
  }

  // Overlapping reporting periods for the same institution
  const overlapping = await prisma.reportingPeriod.findFirst({
    where: {
      institutionId: reportingPeriod.institutionId,
      id: { not: reportingPeriod.id },
      startDate: { lte: reportingPeriod.endDate },
      endDate: { gte: reportingPeriod.startDate },
    },
  });
  if (overlapping) {
    issues.push({ issueType: "OVERLAPPING_REPORTING_PERIOD", severity: ValidationSeverity.ERROR });
  }

  // Programs below benchmark (only meaningful once results have been computed)
  const benchmarks = (
    reportingPeriod.ruleSet.ruleDefinition as { benchmarks?: Record<string, number> }
  )?.benchmarks;
  if (benchmarks) {
    const results = await prisma.cplCalculationResult.findMany({
      where: { reportingPeriodId, programId: { not: null } },
    });
    for (const result of results) {
      const benchmark = benchmarks[result.metric.toLowerCase()];
      // A zero denominator means the metric doesn't apply to this program this period
      // (e.g. no licensure-required completers) — that's not the same as failing to
      // meet the benchmark, so it must not be flagged as if it were.
      if (
        benchmark !== undefined &&
        result.denominator > 0 &&
        Number(result.percentage) < benchmark &&
        result.programId
      ) {
        issues.push({
          programId: result.programId,
          issueType: `BELOW_BENCHMARK_${result.metric}`,
          severity: ValidationSeverity.WARNING,
        });
      }
    }
  }

  await prisma.validationIssue.deleteMany({ where: { reportingPeriodId, resolvedAt: null } });
  if (issues.length > 0) {
    await prisma.validationIssue.createMany({
      data: issues.map((issue) => ({ ...issue, reportingPeriodId })),
    });
  }
}
