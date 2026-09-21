import type { Request, Response } from "express";
import { CPL_METRICS, type CplMetric } from "@outcomelink/shared";
import { z } from "zod";
import { getAccessibleProgramIds } from "../../../lib/accessScope";
import { ApiError } from "../../../lib/apiError";
import { sendData } from "../../../lib/apiResponse";
import { prisma } from "../../../lib/prisma";

export const createNegotiatedBenchmarkSchema = z.object({
  metric: z.enum(CPL_METRICS),
  approvedPercentage: z.coerce.number().min(0).max(100),
  effectiveStartDate: z.coerce.date(),
  effectiveEndDate: z.coerce.date().optional(),
  approvalReference: z.string().trim().min(1).max(2000),
});
type CreateNegotiatedBenchmarkInput = z.infer<typeof createNegotiatedBenchmarkSchema>;

async function findOwnedProgram(
  institutionId: number,
  programId: number,
  accessibleProgramIds: number[] | null,
) {
  if (accessibleProgramIds && !accessibleProgramIds.includes(programId)) {
    throw ApiError.notFound("Program not found");
  }
  const program = await prisma.program.findFirst({ where: { id: programId, institutionId } });
  if (!program) throw ApiError.notFound("Program not found");
  return program;
}

export async function list(req: Request, res: Response) {
  const programId = Number(req.params.programId);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  await findOwnedProgram(req.user!.institutionId, programId, accessibleProgramIds);
  const negotiatedBenchmarks = await prisma.negotiatedBenchmark.findMany({
    where: { programId },
    orderBy: { effectiveStartDate: "desc" },
  });
  sendData(res, { negotiatedBenchmarks });
}

export async function create(
  req: Request<{ programId: string }, unknown, CreateNegotiatedBenchmarkInput>,
  res: Response,
) {
  const programId = Number(req.params.programId);
  // SYSTEM_ADMINISTRATOR-only route (see programs.routes.ts) — never a scoped role, so no lookup needed.
  await findOwnedProgram(req.user!.institutionId, programId, null);

  if (req.body.effectiveEndDate && req.body.effectiveEndDate <= req.body.effectiveStartDate) {
    throw ApiError.badRequest("effectiveEndDate must be after effectiveStartDate");
  }

  const actingUser = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { name: true },
  });

  const negotiatedBenchmark = await prisma.negotiatedBenchmark.create({
    data: { ...req.body, programId, createdBy: actingUser?.name ?? String(req.user!.sub) },
  });
  sendData(res, { negotiatedBenchmark }, 201);
}

/**
 * The single source of truth for "what benchmark actually applies" — used by
 * both the Data Validation below-benchmark check and the Readiness Dashboard,
 * so the two can never disagree about whether a program is meeting its
 * target. Falls back to the RuleSet's standard benchmark when no negotiated
 * rate is active for this program+metric on the given reference date
 * (the reporting period's end date — a negotiated rate is presumed to apply
 * to the period it covers, not the day someone happens to run this check).
 */
export async function getEffectiveBenchmark(
  programId: number,
  metric: CplMetric,
  standardBenchmark: number,
  referenceDate: Date,
): Promise<{ value: number; negotiated: boolean }> {
  const negotiated = await prisma.negotiatedBenchmark.findFirst({
    where: {
      programId,
      metric,
      effectiveStartDate: { lte: referenceDate },
      OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: referenceDate } }],
    },
    orderBy: { effectiveStartDate: "desc" },
  });

  if (negotiated) return { value: Number(negotiated.approvedPercentage), negotiated: true };
  return { value: standardBenchmark, negotiated: false };
}
