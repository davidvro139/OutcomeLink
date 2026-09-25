import type { Request, Response } from "express";
import { z } from "zod";
import { getAccessibleProgramIds } from "../../lib/accessScope";
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
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const outcomes = await prisma.studentOutcomeRecord.findMany({
    where: {
      reportingPeriodId,
      employmentStatus: "EMPLOYED",
      employmentStartDate: { not: null },
      studentEnrollment: {
        student: { institutionId },
        actualCompletionDate: { not: null },
        ...(accessibleProgramIds && { programId: { in: accessibleProgramIds } }),
      },
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
 *
 * Deliberately NOT further restricted for a program-scoped caller (project
 * review, 2026-09-18's access-scoping item): the same schema gap that
 * blocks a per-program breakdown also blocks scoping this to "only my
 * programs' placements" — there's no programId to filter by. It stays an
 * aggregate-only, no-student-or-employer-named number, which is a much
 * smaller exposure than a list/detail route would be.
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
 *
 * Split into a pure `compute*` function and a thin HTTP wrapper (Phase 3
 * Scheduled Reports, docs/TODO.md) so the scheduler can generate this same
 * report outside of any request/response cycle, the same reasoning
 * customReportBuilder.ts's runQuery() was already structured around.
 */
export async function computeOutcomeFunnel(
  institutionId: number,
  reportingPeriodId: number,
  accessibleProgramIds: number[] | null,
) {
  const completions = await prisma.studentClassification.findMany({
    where: {
      reportingPeriodId,
      metric: "COMPLETION",
      classificationCode: { in: ["GRADUATE_COMPLETER", "NON_GRADUATE_COMPLETER"] },
      studentEnrollment: {
        student: { institutionId },
        ...(accessibleProgramIds && { programId: { in: accessibleProgramIds } }),
      },
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

  return {
    stages: [
      { stage: "Completers", count: completerEnrollmentIds.length },
      { stage: "Employed", count: employed.length },
      { stage: "Employed, Related", count: employedRelated.length },
      { stage: "Verified", count: verified.length },
      { stage: "Evidence on File", count: withEvidence.length },
    ],
  };
}

export async function outcomeFunnel(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId } = req.query as unknown as ReportingPeriodQuery;
  await findOwnedPeriod(institutionId, reportingPeriodId);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  sendData(res, await computeOutcomeFunnel(institutionId, reportingPeriodId, accessibleProgramIds));
}

/**
 * The distinct set of students this period the classifier placed in
 * SEEKING_OR_UNKNOWN (has an outcome record, but no resolved employment
 * status) or who have no outcome record at all — exported so the Quarterly
 * Graduate Outreach Campaign (docs/TODO.md deferred items) can target exactly
 * the same population unknownOutcomes() below reports on, rather than
 * re-deriving a second, potentially-divergent definition of "needs
 * follow-up." A student appearing in both underlying queries is deduplicated
 * — one survey per student per campaign run, not two.
 */
export async function getUnresolvedOutcomeStudentIds(
  institutionId: number,
  reportingPeriodId: number,
): Promise<number[]> {
  const [seekingOrUnknown, missingOutcomeIssues] = await Promise.all([
    prisma.studentClassification.findMany({
      where: {
        reportingPeriodId,
        metric: "PLACEMENT",
        classificationCode: "SEEKING_OR_UNKNOWN",
        studentEnrollment: { student: { institutionId } },
      },
      select: { studentEnrollment: { select: { studentId: true } } },
    }),
    prisma.validationIssue.findMany({
      where: { reportingPeriodId, issueType: "MISSING_OUTCOME_RECORD" },
      select: { studentId: true },
    }),
  ]);

  const ids = new Set<number>();
  for (const c of seekingOrUnknown) ids.add(c.studentEnrollment.studentId);
  for (const i of missingOutcomeIssues) if (i.studentId) ids.add(i.studentId);
  return [...ids];
}

export interface UnknownOutcomesProgramCount {
  program: { id: number; name: string } | null;
  seekingOrUnknown: number;
  missingRecord: number;
}

const unknownOutcomesStudentSelect = { id: true, internalStudentId: true, firstName: true, lastName: true } as const;

/**
<<<<<<< HEAD
=======
 * Report pagination and bounded exports (docs/TODO.md): caps the per-student
 * `students` list the interactive endpoint below returns — the aggregate
 * `totalSeekingOrUnknown`/`totalMissingRecord`/`byProgram` counts are
 * unaffected either way. Only the HTTP handler passes this; the Scheduled
 * Reports "Missing Verification Report" built-in (builtInReports.ts) calls
 * computeUnknownOutcomes with no limit at all, since that report's whole
 * purpose is a complete, downloadable list — unlike this endpoint, which
 * only ever renders inline in the browser.
 */
export const UNKNOWN_OUTCOMES_STUDENTS_LIMIT = 200;

/**
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
 * Unknown Outcome: graduate completers this period the classifier placed in
 * SEEKING_OR_UNKNOWN (has an outcome record, but no resolved employment
 * status) or who have no outcome record at all — the population Follow-Up
 * work should be targeting, aggregated by program instead of the flat
 * per-student Follow-Up Queue view.
 */
export async function computeUnknownOutcomes(
  institutionId: number,
  reportingPeriodId: number,
  accessibleProgramIds: number[] | null,
<<<<<<< HEAD
=======
  studentsLimit?: number,
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
) {
  const seekingOrUnknown = await prisma.studentClassification.findMany({
    where: {
      reportingPeriodId,
      metric: "PLACEMENT",
      classificationCode: "SEEKING_OR_UNKNOWN",
      studentEnrollment: {
        student: { institutionId },
        ...(accessibleProgramIds && { programId: { in: accessibleProgramIds } }),
      },
    },
    include: {
      studentEnrollment: {
        include: {
          student: { select: unknownOutcomesStudentSelect },
          program: { select: { id: true, name: true } },
        },
      },
    },
  });

  const missingOutcomeIssues = await prisma.validationIssue.findMany({
    where: {
      reportingPeriodId,
      issueType: "MISSING_OUTCOME_RECORD",
      ...(accessibleProgramIds && { programId: { in: accessibleProgramIds } }),
    },
    include: {
      student: { select: unknownOutcomesStudentSelect },
      program: { select: { id: true, name: true } },
    },
  });

  const byProgram = new Map<number | "none", UnknownOutcomesProgramCount>();
  function bump(program: { id: number; name: string } | null, field: "seekingOrUnknown" | "missingRecord") {
    const key = program?.id ?? "none";
    const entry = byProgram.get(key) ?? { program, seekingOrUnknown: 0, missingRecord: 0 };
    entry[field] += 1;
    byProgram.set(key, entry);
  }
  for (const c of seekingOrUnknown) bump(c.studentEnrollment.program, "seekingOrUnknown");
  for (const i of missingOutcomeIssues) bump(i.program, "missingRecord");

<<<<<<< HEAD
  return {
    totalSeekingOrUnknown: seekingOrUnknown.length,
    totalMissingRecord: missingOutcomeIssues.length,
    students: seekingOrUnknown.map((c) => ({
      student: c.studentEnrollment.student,
      program: c.studentEnrollment.program,
    })),
=======
  const allStudents = seekingOrUnknown.map((c) => ({
    student: c.studentEnrollment.student,
    program: c.studentEnrollment.program,
  }));

  return {
    totalSeekingOrUnknown: seekingOrUnknown.length,
    totalMissingRecord: missingOutcomeIssues.length,
    students: studentsLimit !== undefined ? allStudents.slice(0, studentsLimit) : allStudents,
    studentsTruncated: studentsLimit !== undefined && allStudents.length > studentsLimit,
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
    byProgram: [...byProgram.values()].sort(
      (a, b) => b.seekingOrUnknown + b.missingRecord - (a.seekingOrUnknown + a.missingRecord),
    ),
  };
}

export async function unknownOutcomes(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId } = req.query as unknown as ReportingPeriodQuery;
  await findOwnedPeriod(institutionId, reportingPeriodId);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
<<<<<<< HEAD
  sendData(res, await computeUnknownOutcomes(institutionId, reportingPeriodId, accessibleProgramIds));
=======
  sendData(
    res,
    await computeUnknownOutcomes(institutionId, reportingPeriodId, accessibleProgramIds, UNKNOWN_OUTCOMES_STUDENTS_LIMIT),
  );
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const RESOLVING_OUTCOMES = new Set([
    "EMPLOYMENT_REPORTED",
    "EMPLOYMENT_VERIFIED",
    "SEEKING_EMPLOYMENT",
    "CONTINUING_EDUCATION",
    "UNAVAILABLE",
    "COMPLETE",
  ]);

  const attempts = await prisma.followUpAttempt.findMany({
    where: {
      student: {
        institutionId,
        ...(accessibleProgramIds && { enrollments: { some: { programId: { in: accessibleProgramIds } } } }),
      },
    },
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

const SKILL_DIMENSIONS = [
  "technicalPreparednessRating",
  "communicationRating",
  "problemSolvingRating",
  "professionalismRating",
] as const;
type SkillDimension = (typeof SKILL_DIMENSIONS)[number];
const SKILL_DIMENSION_LABELS: Record<SkillDimension, string> = {
  technicalPreparednessRating: "Technical Preparedness",
  communicationRating: "Communication",
  problemSolvingRating: "Problem Solving",
  professionalismRating: "Professionalism",
};

/**
 * Skills-Gap Analysis (Phase 3, spec §64): compares employers' structured
 * 1-5 skill ratings (technical/communication/problem-solving/professionalism)
 * against the institution-wide average for each, per program, plus the raw
 * free-text skillsGapNotes for qualitative context. Not scoped to a
 * reporting period — EmployerSurvey has no reportingPeriodId of its own
 * (same documented gap placementQuality() already lives with), so this is
 * necessarily an all-time view, same reasoning as Follow-Up Effectiveness
 * above. A survey response is attributed to whichever of the student's
 * completed enrollments finished most recently — an employer survey concerns
 * one specific graduate, not a specific program enrollment, so there's no
 * stronger link available; a student with no completed enrollment on file is
 * counted in the institution-wide averages but can't be attributed to a
 * program row.
 *
 * `byProgram` is filtered to a program-scoped caller's assigned programs
 * (project review, 2026-09-18); `institutionAverages`/`totalResponses` stay
 * whole-institution even for a scoped caller, the same reasoning
 * placementQuality() above documents — they're an aggregate baseline with no
 * student or program named, not a list of records to leak.
 */
<<<<<<< HEAD
=======
const SKILLS_GAP_NOTES_LIMIT = 20;

>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
export async function skillsGapAnalysis(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const responses = await prisma.employerSurveyResponse.findMany({
    where: { survey: { student: { institutionId } } },
    include: {
      survey: {
        include: {
          employer: { select: { name: true } },
          student: {
            include: {
              enrollments: {
                where: { actualCompletionDate: { not: null } },
                orderBy: { actualCompletionDate: "desc" },
                take: 1,
                include: { program: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });

  const institutionRatings: Record<SkillDimension, number[]> = {
    technicalPreparednessRating: [],
    communicationRating: [],
    problemSolvingRating: [],
    professionalismRating: [],
  };

  interface ProgramAgg {
    program: { id: number; name: string };
    ratings: Record<SkillDimension, number[]>;
    notes: { employerName: string; note: string; submittedAt: Date }[];
  }
  const byProgram = new Map<number, ProgramAgg>();

  for (const response of responses) {
    for (const dimension of SKILL_DIMENSIONS) {
      const value = response[dimension];
      if (value !== null) institutionRatings[dimension].push(value);
    }

    const program = response.survey.student.enrollments[0]?.program;
    if (program) {
      const agg = byProgram.get(program.id) ?? {
        program,
        ratings: { technicalPreparednessRating: [], communicationRating: [], problemSolvingRating: [], professionalismRating: [] },
        notes: [],
      };
      for (const dimension of SKILL_DIMENSIONS) {
        const value = response[dimension];
        if (value !== null) agg.ratings[dimension].push(value);
      }
      if (response.skillsGapNotes) {
        agg.notes.push({
          employerName: response.survey.employer.name,
          note: response.skillsGapNotes,
          submittedAt: response.submittedAt,
        });
      }
      byProgram.set(program.id, agg);
    }
  }

  const institutionAverages = Object.fromEntries(
    SKILL_DIMENSIONS.map((d) => [d, average(institutionRatings[d])]),
  ) as Record<SkillDimension, number | null>;

  const byProgramRows = [...byProgram.values()]
    .filter((agg) => !accessibleProgramIds || accessibleProgramIds.includes(agg.program.id))
    .map((agg) => {
    const averages = Object.fromEntries(
      SKILL_DIMENSIONS.map((d) => [d, average(agg.ratings[d])]),
    ) as Record<SkillDimension, number | null>;
    const gaps = Object.fromEntries(
      SKILL_DIMENSIONS.map((d) => {
        const institutionAvg = institutionAverages[d];
        const programAvg = averages[d];
        const gap = institutionAvg !== null && programAvg !== null
          ? Math.round((institutionAvg - programAvg) * 10) / 10
          : null;
        return [d, gap];
      }),
    ) as Record<SkillDimension, number | null>;

    return {
      program: agg.program,
      responseCount: Math.max(...SKILL_DIMENSIONS.map((d) => agg.ratings[d].length), 0),
      averages,
      gaps,
<<<<<<< HEAD
      skillsGapNotes: agg.notes.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime()),
=======
      // Free-text notes are the one genuinely unbounded, ever-growing piece
      // here (the ratings/averages/gaps above are aggregates) — capped to
      // the most recent SKILLS_GAP_NOTES_LIMIT, already sorted newest first
      // (docs/TODO.md's "Report pagination and bounded exports").
      skillsGapNotes: agg.notes
        .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
        .slice(0, SKILLS_GAP_NOTES_LIMIT),
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
    };
  });

  // Worst (largest positive) gap first — the programs most below the institution average lead the list.
  byProgramRows.sort((a, b) => {
    const worstGap = (row: (typeof byProgramRows)[number]) =>
      Math.max(...SKILL_DIMENSIONS.map((d) => row.gaps[d] ?? -Infinity));
    return worstGap(b) - worstGap(a);
  });

  sendData(res, {
    totalResponses: responses.length,
    institutionAverages,
    dimensionLabels: SKILL_DIMENSION_LABELS,
    byProgram: byProgramRows,
  });
}
