import {
  CPL_METRICS,
  RISK_STATUS_SEVERITY,
  STALE_RESULTS_DAYS,
  type CplMetric,
  type RiskStatus,
} from "@outcomelink/shared";
import { prisma } from "../../lib/prisma";
import { ACTIVE_REPORTING_PERIOD_STATUSES } from "../../lib/reportingPeriods";
import { pickEffectiveBenchmark } from "../accreditation/benchmarks/negotiatedBenchmarks";
import { assessMetric } from "./assessment";

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_PERIODS = 6;

export interface MetricAssessment {
  numerator: number;
  denominator: number;
  percentage: number;
  benchmark: number;
  negotiated: boolean;
  status: RiskStatus;
  needed: number | null;
  maxPossiblePercentage: number | null;
  /** Students who could still move this rate before the period closes, split by how they'd count. */
  pools: { numeratorOnly: number; both: number };
}

export interface TrendPoint {
  reportingPeriodId: number;
  label: string;
  /** null when the metric didn't apply that period (denominator 0) or wasn't computed. */
  percentage: number | null;
  benchmark: number | null;
}

export interface ProgramAssessment {
  programId: number;
  name: string;
  code: string | null;
  campusName: string | null;
  status: RiskStatus;
  metrics: Partial<Record<CplMetric, MetricAssessment>>;
  openIssueCount: number;
  /** Completers this period with no outcome on file or still seeking — the students follow-up can still change. */
  unresolvedOutcomeCount: number;
  trend: Record<CplMetric, TrendPoint[]>;
}

export interface AttentionItem {
  /** 3 = act now, 2 = at risk, 1 = housekeeping. */
  severity: 1 | 2 | 3;
  programId: number | null;
  message: string;
  /** Where in the reporting-period screens to go next. */
  link: "reports" | "validation" | "results" | null;
}

export interface ProgramDashboard {
  period: {
    id: number;
    label: string;
    startDate: Date;
    endDate: Date;
    status: string;
    outcomesDeadline: Date | null;
    daysUntilOutcomesDeadline: number | null;
  } | null;
  freshness: {
    computedAt: Date | null;
    ageDays: number | null;
    neverComputed: boolean;
    stale: boolean;
  };
  summary: Record<RiskStatus, number>;
  programs: ProgramAssessment[];
  attention: AttentionItem[];
}

const METRIC_LABELS: Record<CplMetric, string> = {
  COMPLETION: "Completion",
  PLACEMENT: "Placement",
  LICENSURE: "Licensure",
};
const noun = (n: number, singular: string, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;

/** The period to show when none is asked for: the newest still-open one, otherwise the newest of all. */
async function pickPeriod(institutionId: number, requestedId?: number) {
  if (requestedId) {
    return prisma.reportingPeriod.findFirst({
      where: { id: requestedId, institutionId },
      include: { ruleSet: true },
    });
  }
  const open = await prisma.reportingPeriod.findFirst({
    where: { institutionId, status: { in: [...ACTIVE_REPORTING_PERIOD_STATUSES] } },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    include: { ruleSet: true },
  });
  return (
    open ??
    prisma.reportingPeriod.findFirst({
      where: { institutionId },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      include: { ruleSet: true },
    })
  );
}

const standardBenchmarksOf = (ruleDefinition: unknown) =>
  (ruleDefinition as { benchmarks?: Record<string, number> } | null)?.benchmarks;

/**
 * Where every accessible program stands in one reporting period, from the
 * STORED results (nothing is recomputed here — recomputing is institution-wide
 * and slow, so it is a separate, throttled action). `accessibleProgramIds` of
 * null means every program (an unscoped role, or the at-risk job).
 */
export async function buildProgramDashboard(
  institutionId: number,
  accessibleProgramIds: number[] | null,
  requestedPeriodId?: number,
): Promise<ProgramDashboard> {
  const period = await pickPeriod(institutionId, requestedPeriodId);
  const emptySummary: Record<RiskStatus, number> = {
    MEETING: 0,
    AT_RISK: 0,
    OFF_TRACK: 0,
    NO_DATA: 0,
  };
  if (!period) {
    return {
      period: null,
      freshness: { computedAt: null, ageDays: null, neverComputed: true, stale: false },
      summary: emptySummary,
      programs: [],
      attention: [],
    };
  }

  const programs = await prisma.program.findMany({
    where: {
      institutionId,
      active: true,
      ...(accessibleProgramIds && { id: { in: accessibleProgramIds } }),
    },
    select: { id: true, name: true, code: true, campus: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const programIds = programs.map((p) => p.id);

  // Trend window: this period and up to five before it.
  const trendPeriods = (
    await prisma.reportingPeriod.findMany({
      where: { institutionId, startDate: { lte: period.startDate } },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: TREND_PERIODS,
      include: { ruleSet: true },
    })
  ).reverse();

  const [results, freshnessRow, negotiated, pendingClassifications, completionPool, openIssues] =
    await Promise.all([
      prisma.cplCalculationResult.findMany({
        where: {
          reportingPeriodId: { in: trendPeriods.map((p) => p.id) },
          programId: { in: programIds },
        },
      }),
      prisma.cplCalculationResult.aggregate({
        where: { reportingPeriodId: period.id },
        _max: { computedAt: true },
      }),
      prisma.negotiatedBenchmark.findMany({ where: { programId: { in: programIds } } }),
      // Stored classifications that are still "pending" — the students a rate can still move through.
      prisma.studentClassification.findMany({
        where: {
          reportingPeriodId: period.id,
          OR: [
            {
              metric: "PLACEMENT",
              classificationCode: { in: ["SEEKING_OR_UNKNOWN", "AWAITING_LICENSURE"] },
            },
            { metric: "LICENSURE", classificationCode: "AWAITING" },
          ],
          studentEnrollment: { programId: { in: programIds } },
        },
        select: {
          metric: true,
          classificationCode: true,
          studentEnrollment: { select: { programId: true } },
        },
      }),
      // Current students expected to finish inside the period: the only completion students who can still move it.
      prisma.studentEnrollment.groupBy({
        by: ["programId"],
        where: {
          programId: { in: programIds },
          enrollmentStatus: "ACTIVE",
          reportableForAccreditation: true,
          expectedCompletionDate: { lte: period.endDate },
        },
        _count: { _all: true },
      }),
      prisma.validationIssue.groupBy({
        by: ["programId"],
        where: { reportingPeriodId: period.id, resolvedAt: null, programId: { in: programIds } },
        _count: { _all: true },
      }),
    ]);

  const poolFor = (programId: number) => {
    const rows = pendingClassifications.filter((c) => c.studentEnrollment.programId === programId);
    const count = (metric: CplMetric, code: string) =>
      rows.filter((r) => r.metric === metric && r.classificationCode === code).length;
    return {
      seeking: count("PLACEMENT", "SEEKING_OR_UNKNOWN"),
      placementAwaitingLicensure: count("PLACEMENT", "AWAITING_LICENSURE"),
      licensureAwaiting: count("LICENSURE", "AWAITING"),
      activeExpectedToComplete:
        completionPool.find((c) => c.programId === programId)?._count._all ?? 0,
    };
  };
  const issueCountFor = (programId: number) =>
    openIssues.find((i) => i.programId === programId)?._count._all ?? 0;

  const standard = standardBenchmarksOf(period.ruleSet.ruleDefinition);
  const summary = { ...emptySummary };
  const assessed: ProgramAssessment[] = programs.map((program) => {
    const pool = poolFor(program.id);
    const poolsByMetric: Record<CplMetric, { numeratorOnly: number; both: number }> = {
      COMPLETION: { numeratorOnly: 0, both: pool.activeExpectedToComplete },
      PLACEMENT: { numeratorOnly: pool.seeking, both: pool.placementAwaitingLicensure },
      LICENSURE: { numeratorOnly: 0, both: pool.licensureAwaiting },
    };

    const metrics: Partial<Record<CplMetric, MetricAssessment>> = {};
    for (const metric of CPL_METRICS) {
      const result = results.find(
        (r) =>
          r.programId === program.id && r.reportingPeriodId === period.id && r.metric === metric,
      );
      const standardBenchmark = standard?.[metric.toLowerCase()];
      if (!result || standardBenchmark === undefined) continue;
      const { value: benchmark, negotiated: isNegotiated } = pickEffectiveBenchmark(
        negotiated,
        program.id,
        metric,
        standardBenchmark,
        period.endDate,
      );
      const pools = poolsByMetric[metric];
      const assessment = assessMetric({
        numerator: result.numerator,
        denominator: result.denominator,
        percentage: Number(result.percentage),
        benchmark,
        numeratorOnlyPool: pools.numeratorOnly,
        bothPool: pools.both,
      });
      metrics[metric] = {
        numerator: result.numerator,
        denominator: result.denominator,
        percentage: Number(result.percentage),
        benchmark,
        negotiated: isNegotiated,
        status: assessment.status,
        needed: assessment.needed,
        maxPossiblePercentage: assessment.maxPossiblePercentage,
        pools,
      };
    }

    const statuses = Object.values(metrics).map((m) => m.status);
    const overall = statuses.reduce<RiskStatus>(
      (worst, s) => (RISK_STATUS_SEVERITY[s] > RISK_STATUS_SEVERITY[worst] ? s : worst),
      "NO_DATA",
    );
    summary[overall]++;

    const trend = { COMPLETION: [], PLACEMENT: [], LICENSURE: [] } as Record<
      CplMetric,
      TrendPoint[]
    >;
    for (const trendPeriod of trendPeriods) {
      const periodStandard = standardBenchmarksOf(trendPeriod.ruleSet.ruleDefinition);
      for (const metric of CPL_METRICS) {
        const result = results.find(
          (r) =>
            r.programId === program.id &&
            r.reportingPeriodId === trendPeriod.id &&
            r.metric === metric,
        );
        const standardBenchmark = periodStandard?.[metric.toLowerCase()];
        trend[metric].push({
          reportingPeriodId: trendPeriod.id,
          label: trendPeriod.label,
          percentage: result && result.denominator > 0 ? Number(result.percentage) : null,
          benchmark:
            standardBenchmark === undefined
              ? null
              : pickEffectiveBenchmark(
                  negotiated,
                  program.id,
                  metric,
                  standardBenchmark,
                  trendPeriod.endDate,
                ).value,
        });
      }
    }

    return {
      programId: program.id,
      name: program.name,
      code: program.code,
      campusName: program.campus?.name ?? null,
      status: overall,
      metrics,
      openIssueCount: issueCountFor(program.id),
      unresolvedOutcomeCount: pool.seeking,
      trend,
    };
  });

  // Most concerning first.
  assessed.sort(
    (a, b) =>
      RISK_STATUS_SEVERITY[b.status] - RISK_STATUS_SEVERITY[a.status] ||
      a.name.localeCompare(b.name),
  );

  const computedAt = freshnessRow._max.computedAt;
  const ageDays = computedAt ? Math.floor((Date.now() - computedAt.getTime()) / DAY_MS) : null;
  const isActive = (ACTIVE_REPORTING_PERIOD_STATUSES as readonly string[]).includes(period.status);
  const freshness = {
    computedAt,
    ageDays,
    neverComputed: computedAt === null,
    stale: isActive && ageDays !== null && ageDays >= STALE_RESULTS_DAYS,
  };

  const daysUntilOutcomesDeadline = period.outcomesDeadline
    ? Math.ceil((period.outcomesDeadline.getTime() - Date.now()) / DAY_MS)
    : null;

  return {
    period: {
      id: period.id,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      status: period.status,
      outcomesDeadline: period.outcomesDeadline,
      daysUntilOutcomesDeadline,
    },
    freshness,
    summary,
    programs: assessed,
    attention: buildAttention(assessed, freshness, isActive, daysUntilOutcomesDeadline),
  };
}

/** What a program director should look at, most urgent first, in plain language. */
function buildAttention(
  programs: ProgramAssessment[],
  freshness: ProgramDashboard["freshness"],
  isActive: boolean,
  daysUntilDeadline: number | null,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const deadlineNote =
    daysUntilDeadline === null
      ? ""
      : daysUntilDeadline >= 0
        ? ` (${noun(daysUntilDeadline, "day")} to the outcomes deadline)`
        : " (the outcomes deadline has passed)";

  if (isActive && freshness.neverComputed) {
    items.push({
      severity: 3,
      programId: null,
      message:
        "Results have not been computed for this period yet, so the numbers below are empty. Use Recompute now.",
      link: null,
    });
  } else if (freshness.stale) {
    items.push({
      severity: 1,
      programId: null,
      message: `Results were last computed ${noun(freshness.ageDays ?? 0, "day")} ago — recompute to include recent data changes.`,
      link: null,
    });
  }

  for (const program of programs) {
    for (const metric of CPL_METRICS) {
      const m = program.metrics[metric];
      if (!m) continue;
      const label = METRIC_LABELS[metric];
      if (m.status === "OFF_TRACK") {
        items.push({
          severity: 3,
          programId: program.programId,
          message: `${program.name}: ${label} is ${m.percentage}% against a ${m.benchmark}% benchmark and can no longer reach it — the best possible is ${m.maxPossiblePercentage}%.`,
          link: "results",
        });
      } else if (m.status === "AT_RISK") {
        const pool = m.pools.numeratorOnly + m.pools.both;
        items.push({
          severity: 2,
          programId: program.programId,
          message: `${program.name}: ${label} is ${m.percentage}% against ${m.benchmark}% — ${noun(m.needed ?? 0, "more success", "more successes")} needed, and ${noun(pool, "student")} could still move it${deadlineNote}.`,
          link: metric === "PLACEMENT" ? "reports" : "results",
        });
      }
    }
    if (program.unresolvedOutcomeCount > 0) {
      items.push({
        severity: 1,
        programId: program.programId,
        message: `${program.name}: ${noun(program.unresolvedOutcomeCount, "graduate")} with no outcome recorded or still seeking work.`,
        link: "reports",
      });
    }
    if (program.openIssueCount > 0) {
      items.push({
        severity: 1,
        programId: program.programId,
        message: `${program.name}: ${noun(program.openIssueCount, "open validation issue")}.`,
        link: "validation",
      });
    }
  }
  return items.sort((a, b) => b.severity - a.severity);
}
