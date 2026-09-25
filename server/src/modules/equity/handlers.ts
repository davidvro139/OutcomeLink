import type { Request, Response } from "express";
import { EQUITY_DIMENSIONS } from "@outcomelink/shared";
import type { CplMetric, EquityDimension } from "@outcomelink/shared";
import { z } from "zod";
import { getAccessibleProgramIds } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
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
