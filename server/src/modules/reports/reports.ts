import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

/**
 * Advanced Drill-Down Reports (Phase 2 P8, docs/TODO.md; spec §63's
 * "Employer Concentration/Pipeline" report already lives in the Employer
 * Analytics module, P5). Each report answers a question the CPL Dashboard
 * and Readiness tab don't: not "did we hit the benchmark" but "how fast,"
 * "how good," "where does the pipeline leak," "who did we lose track of,"
 * and "is chasing people down actually working."
 */

async function findOwnedPeriod(institutionId: number, reportingPeriodId: number) {
  const period = await prisma.reportingPeriod.findFirst({
    where: { id: reportingPeriodId, institutionId },
  });
  if (!period) throw ApiError.notFound("Reporting period not found");
  return period;
}

export const reportingPeriodQuerySchema = z.object({
  reportingPeriodId: z.coerce.number().int().positive(),
});
type ReportingPeriodQuery = z.infer<typeof reportingPeriodQuerySchema>;

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/**
 * Time-to-Employment: for graduate completers this period with a related or
 * unrelated employment start date on file, how many days elapsed between
 * completion and starting work. Per program, plus bucketed distribution.
 */
export async function timeToEmployment(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId } = req.query as unknown as ReportingPeriodQuery;
  await findOwnedPeriod(institutionId, reportingPeriodId);

  const outcomes = await prisma.studentOutcomeRecord.findMany({
    where: {
      reportingPeriodId,
      employmentStatus: "EMPLOYED",
      employmentStartDate: { not: null },
      studentEnrollment: { student: { institutionId }, actualCompletionDate: { not: null } },
    },
    include: { studentEnrollment: { include: { program: { select: { id: true, name: true } } } } },
  });

  interface ProgramAgg {
    program: { id: number; name: string };
    days: number[];
  }
  const byProgram = new Map<number, ProgramAgg>();
  const allDays: number[] = [];
  const buckets = { immediate30: 0, days31to60: 0, days61to90: 0, over90: 0 };

  for (const outcome of outcomes) {
    const completionDate = outcome.studentEnrollment.actualCompletionDate!;
    const days = Math.max(0, daysBetween(completionDate, outcome.employmentStartDate!));
    allDays.push(days);
    if (days <= 30) buckets.immediate30 += 1;
    else if (days <= 60) buckets.days31to60 += 1;
    else if (days <= 90) buckets.days61to90 += 1;
    else buckets.over90 += 1;

    const programId = outcome.studentEnrollment.programId;
    const agg = byProgram.get(programId) ?? {
      program: outcome.studentEnrollment.program,
      days: [],
    };
    agg.days.push(days);
    byProgram.set(programId, agg);
  }

  sendData(res, {
    overall: { count: allDays.length, averageDays: average(allDays), medianDays: median(allDays) },
    distribution: buckets,
    byProgram: [...byProgram.values()]
      .map((p) => ({
        program: p.program,
        count: p.days.length,
        averageDays: average(p.days),
        medianDays: median(p.days),
      }))
      .sort((a, b) => (a.averageDays ?? 0) - (b.averageDays ?? 0)),
  });
}

/**
 * Placement Quality: institution-wide (not per-program — EmploymentRecord
 * has no programId/reportingPeriodId of its own, only studentId+employerId,
 * so a per-program breakdown here would mean guessing which enrollment an
 * employment record belongs to; flagged rather than faked, same standard as
 * validationEngine.ts's own documented scope limits) full-time rate,
 * verification rate, and wage stats among employment records starting
 * within the given reporting period's date range.
 */
export async function placementQuality(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId } = req.query as unknown as ReportingPeriodQuery;
  const period = await findOwnedPeriod(institutionId, reportingPeriodId);

  const records = await prisma.employmentRecord.findMany({
    where: {
      student: { institutionId },
      startDate: { gte: period.startDate, lte: period.endDate },
    },
  });

  const total = records.length;
  const fullTimeCount = records.filter((r) => r.fullTime).length;
  const relatedCount = records.filter((r) => r.relatedToTraining).length;
  const verifiedCount = records.filter((r) => r.verificationStatus).length;
  const wages = records
    .map((r) => (r.salaryOrWage !== null ? Number(r.salaryOrWage) : null))
    .filter((w): w is number => w !== null);

  sendData(res, {
    totalPlacements: total,
    fullTimeRate: total > 0 ? Math.round((fullTimeCount / total) * 10000) / 100 : 0,
    relatedRate: total > 0 ? Math.round((relatedCount / total) * 10000) / 100 : 0,
    verifiedRate: total > 0 ? Math.round((verifiedCount / total) * 10000) / 100 : 0,
    averageWage: average(wages),
    medianWage: median(wages),
    wageRecordCount: wages.length,
  });
}

/**
 * Outcome Funnel: how many of this period's completers make it through
 * each successive stage of "do we actually know what happened to them, with
 * evidence to prove it" — Completers -> Employed -> Employed Related ->
 * Verified -> Evidence on File.
 */
export async function outcomeFunnel(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId } = req.query as unknown as ReportingPeriodQuery;
  await findOwnedPeriod(institutionId, reportingPeriodId);

  const completions = await prisma.studentClassification.findMany({
    where: {
      reportingPeriodId,
      metric: "COMPLETION",
      classificationCode: { in: ["GRADUATE_COMPLETER", "NON_GRADUATE_COMPLETER"] },
      studentEnrollment: { student: { institutionId } },
    },
    select: { studentEnrollmentId: true },
  });
  const completerEnrollmentIds = completions.map((c) => c.studentEnrollmentId);

  const outcomes = await prisma.studentOutcomeRecord.findMany({
    where: { reportingPeriodId, studentEnrollmentId: { in: completerEnrollmentIds } },
    include: { evidence: { select: { id: true } } },
  });

  const employed = outcomes.filter((o) => o.employmentStatus === "EMPLOYED");
  const employedRelated = employed.filter((o) => o.relatedToTraining === true);
  const verified = employedRelated.filter((o) => o.verificationStatus);
  const withEvidence = verified.filter((o) => o.evidence.length > 0);

  sendData(res, {
    stages: [
      { stage: "Completers", count: completerEnrollmentIds.length },
      { stage: "Employed", count: employed.length },
      { stage: "Employed, Related", count: employedRelated.length },
      { stage: "Verified", count: verified.length },
      { stage: "Evidence on File", count: withEvidence.length },
    ],
  });
}

/**
 * Unknown Outcome: graduate completers this period the classifier placed in
 * SEEKING_OR_UNKNOWN (has an outcome record, but no resolved employment
 * status) or who have no outcome record at all — the population Follow-Up
 * work should be targeting, aggregated by program instead of the flat
 * per-student Follow-Up Queue view.
 */
export async function unknownOutcomes(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId } = req.query as unknown as ReportingPeriodQuery;
  await findOwnedPeriod(institutionId, reportingPeriodId);

  const seekingOrUnknown = await prisma.studentClassification.findMany({
    where: {
      reportingPeriodId,
      metric: "PLACEMENT",
      classificationCode: "SEEKING_OR_UNKNOWN",
      studentEnrollment: { student: { institutionId } },
    },
    include: {
      studentEnrollment: {
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          program: { select: { id: true, name: true } },
        },
      },
    },
  });

  const missingOutcomeIssues = await prisma.validationIssue.findMany({
    where: { reportingPeriodId, issueType: "MISSING_OUTCOME_RECORD" },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      program: { select: { id: true, name: true } },
    },
  });

  interface ProgramCount {
    program: { id: number; name: string } | null;
    seekingOrUnknown: number;
    missingRecord: number;
  }
  const byProgram = new Map<number | "none", ProgramCount>();
  function bump(program: { id: number; name: string } | null, field: "seekingOrUnknown" | "missingRecord") {
    const key = program?.id ?? "none";
    const entry = byProgram.get(key) ?? { program, seekingOrUnknown: 0, missingRecord: 0 };
    entry[field] += 1;
    byProgram.set(key, entry);
  }
  for (const c of seekingOrUnknown) bump(c.studentEnrollment.program, "seekingOrUnknown");
  for (const i of missingOutcomeIssues) bump(i.program, "missingRecord");

  sendData(res, {
    totalSeekingOrUnknown: seekingOrUnknown.length,
    totalMissingRecord: missingOutcomeIssues.length,
    students: seekingOrUnknown.map((c) => ({
      student: c.studentEnrollment.student,
      program: c.studentEnrollment.program,
    })),
    byProgram: [...byProgram.values()].sort(
      (a, b) => b.seekingOrUnknown + b.missingRecord - (a.seekingOrUnknown + a.missingRecord),
    ),
  });
}

/**
 * Follow-Up Effectiveness: of every follow-up attempt logged, how many
 * actually resolved to a known outcome (as opposed to no response / still
 * pending), broken down by outcome type and by staff member. Not scoped to
 * a reporting period — a follow-up campaign for one period's completers
 * often runs into the next period, and staff effectiveness is a
 * cross-period question anyway.
 */
export async function followUpEffectiveness(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;

  const RESOLVING_OUTCOMES = new Set([
    "EMPLOYMENT_REPORTED",
    "EMPLOYMENT_VERIFIED",
    "SEEKING_EMPLOYMENT",
    "CONTINUING_EDUCATION",
    "UNAVAILABLE",
    "COMPLETE",
  ]);

  const attempts = await prisma.followUpAttempt.findMany({
    where: { student: { institutionId } },
    include: { staffUser: { select: { id: true, name: true } } },
  });

  const byOutcome = new Map<string, number>();
  for (const a of attempts) byOutcome.set(a.outcome, (byOutcome.get(a.outcome) ?? 0) + 1);

  const resolvingCount = attempts.filter((a) => RESOLVING_OUTCOMES.has(a.outcome)).length;

  interface StaffAgg {
    staffUser: { id: number; name: string };
    attempts: number;
    resolving: number;
  }
  const byStaff = new Map<number, StaffAgg>();
  for (const a of attempts) {
    const agg = byStaff.get(a.staffUserId) ?? { staffUser: a.staffUser, attempts: 0, resolving: 0 };
    agg.attempts += 1;
    if (RESOLVING_OUTCOMES.has(a.outcome)) agg.resolving += 1;
    byStaff.set(a.staffUserId, agg);
  }

  sendData(res, {
    totalAttempts: attempts.length,
    resolvingRate: attempts.length > 0 ? Math.round((resolvingCount / attempts.length) * 10000) / 100 : 0,
    byOutcome: [...byOutcome.entries()].map(([outcome, count]) => ({ outcome, count })),
    byStaff: [...byStaff.values()]
      .map((s) => ({
        staffUser: s.staffUser,
        attempts: s.attempts,
        resolvingRate: s.attempts > 0 ? Math.round((s.resolving / s.attempts) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.attempts - a.attempts),
  });
}
