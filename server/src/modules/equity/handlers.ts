import type { Request, Response } from "express";
import { EQUITY_DIMENSIONS } from "@outcomelink/shared";
import type { CplMetric, EquityDimension } from "@outcomelink/shared";
import { z } from "zod";
import { getAccessibleProgramIds } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { sendXlsx } from "../../lib/xlsx";
import { buildEquityBreakdown } from "./equityBreakdown";

export const breakdownQuerySchema = z.object({
  reportingPeriodId: z.coerce.number().int().positive().optional(),
  metric: z.enum(["COMPLETION", "PLACEMENT", "LICENSURE"]),
  dimension: z.enum(EQUITY_DIMENSIONS),
  programId: z.coerce.number().int().positive().optional(),
});

export async function show(req: Request, res: Response) {
  const { reportingPeriodId, metric, dimension, programId } = req.query as unknown as z.infer<typeof breakdownQuerySchema>;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  try {
    const breakdown = await buildEquityBreakdown(req.user!.institutionId, accessibleProgramIds, {
      reportingPeriodId,
      metric: metric as CplMetric,
      dimension: dimension as EquityDimension,
      programId,
    });
    sendData(res, breakdown);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not accessible")) {
      throw ApiError.forbidden("Program not accessible");
    }
    throw err;
  }
}

export async function exportBreakdown(req: Request, res: Response) {
  const { reportingPeriodId, metric, dimension, programId } = req.query as unknown as z.infer<typeof breakdownQuerySchema>;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  try {
    const breakdown = await buildEquityBreakdown(req.user!.institutionId, accessibleProgramIds, {
      reportingPeriodId,
      metric: metric as CplMetric,
      dimension: dimension as EquityDimension,
      programId,
    });

    const filename = `equity-${dimension}-${metric}-${breakdown.period?.label || 'current'}.xlsx`;

    await sendXlsx(res, filename, [
      {
        name: "Groups",
        columns: [
          { header: "Group", key: "label", width: 24 },
          { header: "Denominator", key: "denominator", width: 14 },
          { header: "Numerator", key: "numerator", width: 14 },
          { header: "Percentage", key: "percentage", width: 14 },
          { header: "Status", key: "status", width: 16 },
        ],
        rows: breakdown.groups.map((g) => ({
          label: g.label,
          denominator: g.denominator,
          numerator: g.numerator ?? "—",
          percentage: g.percentage !== null ? `${g.percentage}%` : "—",
          status: g.suppressed ? "Suppressed" : g.status === "NO_DATA" ? "No Data" : "Reported",
        })),
      },
      {
        name: "Trend",
        columns: [
          { header: "Group", key: "label", width: 24 },
          ...breakdown.trend[0]?.points.map((_, idx) => ({
            header: breakdown.trend[0]?.points[idx]?.label || `Period ${idx}`,
            key: `period_${idx}`,
            width: 14,
          })) || [],
        ],
        rows: breakdown.trend.map((series) => ({
          label: series.label,
          ...Object.fromEntries(
            series.points.map((point, idx) => [
              `period_${idx}`,
              point.percentage !== null ? `${point.percentage}%` : "—",
            ]),
          ),
        })),
      },
      {
        name: "Provenance",
        columns: [
          { header: "Item", key: "item", width: 32 },
          { header: "Value", key: "value", width: 48 },
        ],
        rows: [
          {
            item: "Metric",
            value: metric,
          },
          {
            item: "Dimension",
            value: dimension,
          },
          {
            item: "Reporting Period",
            value: breakdown.period?.label || "Current",
          },
          {
            item: "Scope",
            value: breakdown.scope.programName ? `${breakdown.scope.programName} (Program ID: ${breakdown.scope.programId})` : "All Accessible Programs",
          },
          {
            item: "Small-Cell Suppression Threshold",
            value: `${breakdown.suppressionThreshold} students`,
          },
          {
            item: "Suppression Rule",
            value: `Groups with fewer than ${breakdown.suppressionThreshold} students in the denominator have numerator and percentage hidden to protect privacy.`,
          },
          {
            item: "Not on File",
            value: "Students without data recorded for demographic dimensions appear in the 'Not on file' group to ensure transparent reporting of data coverage.",
          },
          {
            item: "Coverage",
            value: breakdown.coverage
              ? `${breakdown.coverage.withDataOnFile} of ${breakdown.coverage.totalDenominator} students have demographic data on file (${Math.round((breakdown.coverage.withDataOnFile / breakdown.coverage.totalDenominator) * 100)}%)`
              : "N/A (dimension does not require demographic data)",
          },
        ],
      },
    ]);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not accessible")) {
      throw ApiError.forbidden("Program not accessible");
    }
    throw err;
  }
}
