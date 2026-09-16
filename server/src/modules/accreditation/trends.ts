import type { Request, Response } from "express";
import { CPL_METRICS, type CplMetric } from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const trendsQuerySchema = z.object({
  programId: z.coerce.number().int().positive().optional(),
});
type TrendsQuery = z.infer<typeof trendsQuerySchema>;

interface MetricTrendPoint {
  numerator: number;
  denominator: number;
  percentage: number;
}

/**
 * Historical Trend Reporting (Phase 2 P3, docs/TODO.md): every reporting
 * period's CPL results for one program (or institution-wide when programId
 * is omitted), ordered chronologically — the CPL Dashboard and Readiness tab
 * both answer "how is this period doing," this answers "is it improving."
 */
export async function trends(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const { programId } = req.query as unknown as TrendsQuery;

  if (programId) {
    const program = await prisma.program.findFirst({ where: { id: programId, institutionId } });
    if (!program) throw ApiError.badRequest("Unknown programId");
  }

  const reportingPeriods = await prisma.reportingPeriod.findMany({
    where: { institutionId },
    orderBy: { startDate: "asc" },
  });

  const results = await prisma.cplCalculationResult.findMany({
    where: {
      programId: programId ?? null,
      reportingPeriodId: { in: reportingPeriods.map((p) => p.id) },
    },
  });

  const resultsByPeriod = new Map<number, typeof results>();
  for (const result of results) {
    const forPeriod = resultsByPeriod.get(result.reportingPeriodId) ?? [];
    forPeriod.push(result);
    resultsByPeriod.set(result.reportingPeriodId, forPeriod);
  }

  const trendRows = reportingPeriods.map((period) => {
    const periodResults = resultsByPeriod.get(period.id) ?? [];
    const metrics: Partial<Record<CplMetric, MetricTrendPoint>> = {};
    for (const metric of CPL_METRICS) {
      const result = periodResults.find((r) => r.metric === metric);
      if (result) {
        metrics[metric] = {
          numerator: result.numerator,
          denominator: result.denominator,
          percentage: Number(result.percentage),
        };
      }
    }
    return {
      reportingPeriod: {
        id: period.id,
        label: period.label,
        startDate: period.startDate,
        endDate: period.endDate,
        status: period.status,
      },
      metrics,
    };
  });

  sendData(res, { trends: trendRows });
}
