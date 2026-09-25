import { CplMetric } from "@outcomelink/shared";
import type { EquityDimension } from "@outcomelink/shared";
import { prisma } from "../../lib/prisma";

const SUPPRESSION_THRESHOLD = 10;

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

  // Find latest reporting period
  const latestPeriod = await prisma.reportingPeriod.findFirst({
    where: {
      institutionId,
      ...(params.reportingPeriodId ? { id: params.reportingPeriodId } : {}),
    },
    orderBy: { endDate: "desc" },
    select: { id: true, label: true, endDate: true },
  });

  if (!latestPeriod) {
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

  // Fetch classifications for current period
  const classifications = await prisma.studentClassification.findMany({
    where: {
      reportingPeriodId: latestPeriod.id,
      metric: params.metric,
      ...(programIds.length > 0 ? { studentEnrollment: { programId: { in: programIds } } } : {}),
    },
    include: {
      explanation: true,
      studentEnrollment: { select: { startDate: true, studentId: true } },
    },
  });

  // Group by dimension
  const groupMap = new Map<string, { numerator: number; denominator: number }>();
  const demographicStudentIds = new Set<number>();

  for (const c of classifications) {
    if (!c.explanation) continue;

    let groupKey: string;
    if (params.dimension === "entryYear") {
      groupKey = String(c.studentEnrollment.startDate.getUTCFullYear());
    } else {
      demographicStudentIds.add(c.studentEnrollment.studentId);
      groupKey = "pending";
    }

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, { numerator: 0, denominator: 0 });
    }
    const group = groupMap.get(groupKey)!;
    if (c.explanation.countsInDenominator) group.denominator += 1;
    if (c.explanation.countsInNumerator) group.numerator += 1;
  }

  // For demographic dimensions, fetch demographics and re-group
  if (params.dimension !== "entryYear" && demographicStudentIds.size > 0) {
    const demographics = await prisma.studentDemographics.findMany({
      where: { studentId: { in: Array.from(demographicStudentIds) } },
    });
    const demographicsMap = new Map(demographics.map((d) => [d.studentId, d]));

    groupMap.clear();

    for (const c of classifications) {
      if (!c.explanation) continue;

      const demo = demographicsMap.get(c.studentEnrollment.studentId);
      let groupKey: string;

      const fieldValue = demo?.[params.dimension as keyof typeof demo];
      if (fieldValue) {
        groupKey = String(fieldValue);
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

  // Build groups array with suppression
  const groups: EquityBreakdownGroup[] = Array.from(groupMap.entries()).map(
    ([value, counts]) => {
      const suppressed = counts.denominator < SUPPRESSION_THRESHOLD;
      const percentage =
        !suppressed && counts.denominator > 0
          ? Math.round((counts.numerator / counts.denominator) * 100 * 100) / 100
          : null;
      let status: EquityBreakdownGroup["status"] = "NO_DATA";
      if (suppressed) {
        status = "SUPPRESSED";
      } else if (counts.denominator === 0) {
        status = "NO_DATA";
      }

      return {
        value,
        label: value === "NOT_ON_FILE" ? "Not on file" : value,
        denominator: counts.denominator,
        numerator: suppressed ? null : counts.numerator,
        percentage,
        suppressed,
        status,
      };
    },
  );

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

  // Build trend across last 6 periods
  const trend: EquityBreakdownTrendSeries[] = [];
  const periods = await prisma.reportingPeriod.findMany({
    where: { institutionId },
    orderBy: { endDate: "desc" },
    take: 6,
    select: { id: true, label: true, endDate: true },
  });

  // Get group values to build trend series
  const groupValues = new Set(groups.map((g) => g.value));
  for (const groupValue of groupValues) {
    const points: EquityBreakdownTrendPoint[] = [];

    for (const period of periods.reverse()) {
      const periodsClassifications = await prisma.studentClassification.findMany({
        where: {
          reportingPeriodId: period.id,
          metric: params.metric,
          ...(programIds.length > 0 ? { enrollment: { programId: { in: programIds } } } : {}),
        },
        include: { explanation: true, enrollment: { select: { startDate: true, studentId: true } } },
      });

      let numerator = 0;
      let denominator = 0;
      const studentIds = new Set<number>();

      for (const c of periodsClassifications) {
        if (!c.explanation) continue;

        let matches = false;
        if (params.dimension === "entryYear") {
          matches = String(c.enrollment.startDate.getUTCFullYear()) === groupValue;
        } else {
          studentIds.add(c.enrollment.studentId);
          matches = true;
        }

        if (matches) {
          if (c.explanation.countsInDenominator) denominator += 1;
          if (c.explanation.countsInNumerator) numerator += 1;
        }
      }

      // For demographics, filter by actual demographic values
      if (params.dimension !== "entryYear" && studentIds.size > 0) {
        const demographics = await prisma.studentDemographics.findMany({
          where: { studentId: { in: Array.from(studentIds) } },
        });
        const demographicsMap = new Map(demographics.map((d) => [d.studentId, d]));

        numerator = 0;
        denominator = 0;

        for (const c of periodsClassifications) {
          if (!c.explanation) continue;

          const demo = demographicsMap.get(c.enrollment.studentId);
          const fieldValue = demo?.[params.dimension as keyof typeof demo];
          const matches = fieldValue ? String(fieldValue) === groupValue : groupValue === "NOT_ON_FILE";

          if (matches) {
            if (c.explanation.countsInDenominator) denominator += 1;
            if (c.explanation.countsInNumerator) numerator += 1;
          }
        }
      }

      const suppressed = denominator < SUPPRESSION_THRESHOLD;
      const percentage =
        !suppressed && denominator > 0 ? Math.round((numerator / denominator) * 100 * 100) / 100 : null;

      points.push({
        label: period.label,
        percentage,
        benchmark: programIds.length === 1 ? 0 : null, // Placeholder for benchmark
      });
    }

    trend.push({
      label: groups.find((g) => g.value === groupValue)?.label || groupValue,
      points,
    });
  }

  return {
    metric: params.metric,
    dimension: params.dimension,
    period: latestPeriod ? { ...latestPeriod, endDate: latestPeriod.endDate.toISOString() } : null,
    groups,
    trend,
    coverage,
    benchmark: null,
    scope: { programId: programIds[0], programName },
    suppressionThreshold: SUPPRESSION_THRESHOLD,
  };
}
