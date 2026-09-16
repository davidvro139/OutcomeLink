import type { Request, Response } from "express";
import { CPL_METRICS, type CplMetric } from "@outcomelink/shared";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { getEffectiveBenchmark } from "./benchmarks/negotiatedBenchmarks";

interface MetricReadiness {
  numerator: number;
  denominator: number;
  percentage: number;
  benchmark: number;
  negotiated: boolean;
  meetsBenchmark: boolean;
}

/**
 * Accreditation Readiness Dashboard (Phase 2 P2, docs/TODO.md): a per-program
 * rollup of "would this program pass an accreditation review right now" —
 * distinct from the CPL Dashboard's raw percentages and the Validation tab's
 * flat issue list. Reuses both (CplCalculationResult, ValidationIssue,
 * getEffectiveBenchmark) rather than recomputing anything, so it can never
 * drift out of sync with what those already show.
 */
export async function readiness(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  const reportingPeriod = await prisma.reportingPeriod.findFirst({
    where: { id: reportingPeriodId, institutionId: req.user!.institutionId },
    include: { ruleSet: true },
  });
  if (!reportingPeriod) throw ApiError.notFound("Reporting period not found");

  const standardBenchmarks = (
    reportingPeriod.ruleSet.ruleDefinition as { benchmarks?: Record<string, number> }
  )?.benchmarks;

  const [results, programs, openIssues] = await Promise.all([
    prisma.cplCalculationResult.findMany({ where: { reportingPeriodId, programId: { not: null } } }),
    prisma.program.findMany({
      where: { institutionId: req.user!.institutionId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.validationIssue.findMany({
      where: { reportingPeriodId, resolvedAt: null, programId: { not: null } },
      select: { programId: true },
    }),
  ]);

  const resultsByProgram = new Map<number, typeof results>();
  for (const result of results) {
    if (!result.programId) continue;
    const forProgram = resultsByProgram.get(result.programId) ?? [];
    forProgram.push(result);
    resultsByProgram.set(result.programId, forProgram);
  }

  const openIssueCountByProgram = new Map<number, number>();
  for (const issue of openIssues) {
    if (!issue.programId) continue;
    openIssueCountByProgram.set(issue.programId, (openIssueCountByProgram.get(issue.programId) ?? 0) + 1);
  }

  const readinessRows = [];
  for (const program of programs) {
    const programResults = resultsByProgram.get(program.id) ?? [];
    const metrics: Partial<Record<CplMetric, MetricReadiness>> = {};

    for (const metric of CPL_METRICS) {
      const result = programResults.find((r) => r.metric === metric);
      const standardBenchmark = standardBenchmarks?.[metric.toLowerCase()];
      if (!result || standardBenchmark === undefined) continue;

      const { value: benchmark, negotiated } = await getEffectiveBenchmark(
        program.id,
        metric,
        standardBenchmark,
        reportingPeriod.endDate,
      );

      // Denominator 0 means this metric doesn't apply this period (e.g. no
      // licensure-required completers) — treated as meeting, not failing.
      const meetsBenchmark = result.denominator === 0 || Number(result.percentage) >= benchmark;

      metrics[metric] = {
        numerator: result.numerator,
        denominator: result.denominator,
        percentage: Number(result.percentage),
        benchmark,
        negotiated,
        meetsBenchmark,
      };
    }

    const openIssueCount = openIssueCountByProgram.get(program.id) ?? 0;
    const metricValues = Object.values(metrics);
    const ready =
      metricValues.length > 0 && metricValues.every((m) => m.meetsBenchmark) && openIssueCount === 0;

    readinessRows.push({ program, metrics, openIssueCount, ready });
  }

  sendData(res, {
    readiness: readinessRows,
    summary: {
      totalPrograms: readinessRows.length,
      readyPrograms: readinessRows.filter((r) => r.ready).length,
      programsWithOpenIssues: readinessRows.filter((r) => r.openIssueCount > 0).length,
    },
  });
}
