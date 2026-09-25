import { CplMetric, EQUITY_DIMENSION_LABELS } from "@outcomelink/shared";
import type { EquityDimension } from "@outcomelink/shared";
import { prisma } from "../../lib/prisma";
import { pickPeriod, pickEffectiveBenchmark } from "../accreditation/calculators/cplCalculator";

const SUPPRESSION_THRESHOLD = 10;
const TREND_PERIODS = 6;

export interface EquityBreakdownGroup {
  value: string;
  label: string;
  denominator: number;
  numerator: number | null;
  percentage: number | null;
  suppressed: boolean;
  status: "NO_DATA" | "SUPPRESSED" | "MEETING" | "BELOW_BENCHMARK";
}

export interface EquityBreakdownTrendPoint {
  label: string;
  percentage: number | null;
  benchmark: number | null;
}

export interface EquityBreakdownTrendSeries {
  label: string;
  points: EquityBreakdownTrendPoint[];
}

export interface EquityBreakdownResult {
  metric: CplMetric;
  dimension: EquityDimension;
  period: { id: number; label: string; endDate: string } | null;
  groups: EquityBreakdownGroup[];
  trend: EquityBreakdownTrendSeries[];
  coverage: { totalDenominator: number; withDataOnFile: number } | null;
  benchmark: { value: number } | null;
  scope: { programId?: number; programName?: string | null };
  suppressionThreshold: number;
}

export async function buildEquityBreakdown(
  institutionId: number,
  accessibleProgramIds: number[] | null,
  params: {
    reportingPeriodId?: number;
    metric: CplMetric;
    dimension: EquityDimension;
    programId?: number;
  },
): Promise<EquityBreakdownResult> {
  // Resolve program scope
  let programIds = accessibleProgramIds ?? [];
  if (params.programId) {
    if (!programIds.includes(params.programId)) {
      throw new Error("Program not accessible to this user");
    }
    programIds = [params.programId];
  }

  // Resolve current period
  const period = await pickPeriod(institutionId, params.reportingPeriodId);

  if (!period) {
    return {
      metric: params.metric,
      dimension: params.dimension,
      period: null,
      groups: [],
      trend: [],
      coverage: null,
      benchmark: null,
      scope: { programId: params.programId },
      suppressionThreshold: SUPPRESSION_THRESHOLD,
    };
  }

  // Fetch classifications for current period, grouped by dimension
  const classifications = await prisma.studentClassification.findMany({
    where: {
      reportingPeriodId: period.id,
      metric: params.metric,
      ...(programIds.length > 0 ? { enrollment: { programId: { in: programIds } } } : {}),
    },
    select: {
      explanation: { select: { countsInNumerator: true, countsInDenominator: true } },
      enrollment: {
        select: {
          startDate: true,
          studentId: true,
        },
      },
    },
  });

  // Group by dimension
  const groupMap = new Map<string, { numerator: number; denominator: number }>();
  const demographicStudentIds = new Set<number>();

  for (const c of classifications) {
    let groupKey: string;
    if (params.dimension === "entryYear") {
      groupKey = String(c.enrollment.startDate.getUTCFullYear());
    } else {
      demographicStudentIds.add(c.enrollment.studentId);
      groupKey = "pending"; // Will be filled by demographics lookup
    }

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, { numerator: 0, denominator: 0 });
    }
    const group = groupMap.get(groupKey)!;
    if (c.explanation.countsInDenominator) group.denominator += 1;
    if (c.explanation.countsInNumerator) group.numerator += 1;
  }

  // For demographic dimensions, fetch demographics and re-group
  let demographicsMap: Map<number, any> = new Map();
  if (params.dimension !== "entryYear" && demographicStudentIds.size > 0) {
    const demographics = await prisma.studentDemographics.findMany({
      where: { studentId: { in: Array.from(demographicStudentIds) } },
    });
    for (const d of demographics) {
      demographicsMap.set(d.studentId, d);
    }

    groupMap.clear();
    let totalWithData = 0;

    for (const c of classifications) {
      const demo = demographicsMap.get(c.enrollment.studentId);
      let groupKey: string;

      if (demo?.[params.dimension as keyof typeof demo]) {
        groupKey = demo[params.dimension];
        totalWithData += 1;
      } else {
        groupKey = "NOT_ON_FILE";
      }

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, { numerator: 0, denominator: 0 });
      }
      const group = groupMap.get(groupKey)!;
      if (c.explanation.countsInDenominator) group.denominator += 1;
      if (c.explanation.countsInNumerator) group.numerator += 1;
    }
  }

  // Build groups array with labels and suppression
  const groups: EquityBreakdownGroup[] = Array.from(groupMap.entries()).map(
    ([value, counts]) => {
      const suppressed = counts.denominator < SUPPRESSION_THRESHOLD;
      const percentage = !suppressed && counts.denominator > 0 ? (counts.numerator / counts.denominator) * 100 : null;
      let status: EquityBreakdownGroup["status"] = "NO_DATA";
      if (suppressed) {
        status = "SUPPRESSED";
      } else if (counts.denominator === 0) {
        status = "NO_DATA";
      }

      return {
        value,
        label: value === "NOT_ON_FILE" ? "Not on file" : EQUITY_DIMENSION_LABELS[params.dimension] ? `${value}` : value,
        denominator: counts.denominator,
        numerator: suppressed ? null : counts.numerator,
        percentage,
        suppressed,
        status,
      };
    },
  );

  // Get benchmark if single program
  let benchmark: { value: number } | null = null;
  if (programIds.length === 1) {
    const b = await pickEffectiveBenchmark(programIds[0], params.metric);
    if (b) benchmark = { value: b };
  }

  // Get program name if single program
  let programName: string | null = null;
  if (programIds.length === 1) {
    const prog = await prisma.program.findUnique({
      where: { id: programIds[0] },
      select: { name: true },
    });
    programName = prog?.name ?? null;
  }

  // Calculate coverage for demographic dimensions
  let coverage: { totalDenominator: number; withDataOnFile: number } | null = null;
  if (params.dimension !== "entryYear") {
    let totalDenominator = 0;
    let withDataOnFile = 0;
    for (const [value, counts] of groupMap.entries()) {
      totalDenominator += counts.denominator;
      if (value !== "NOT_ON_FILE") withDataOnFile += counts.denominator;
    }
    coverage = { totalDenominator, withDataOnFile };
  }

  return {
    metric: params.metric,
    dimension: params.dimension,
    period,
    groups,
    trend: [], // TODO: implement trend across periods
    coverage,
    benchmark,
    scope: { programId: programIds[0], programName },
    suppressionThreshold: SUPPRESSION_THRESHOLD,
  };
}
