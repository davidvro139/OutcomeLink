import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { buildProgramDashboard } from "../programDashboard/programDashboard";
import { evaluateCloseout, type CloseoutEvaluation, type CloseoutFacts } from "./closeoutRules";

/**
 * Records whose edits change what compute and validation would say. The audit
 * extension logs every write, and unlike these tables has a timestamp — so
 * "data changed since X" is a count of these entries after X, by users of the
 * institution. (Compute and validation themselves write none of these.)
 */
const DATA_ENTITY_TYPES = [
  "Student",
  "StudentEnrollment",
  "StudentOutcomeRecord",
  "EmploymentRecord",
  "LicensureResult",
];

async function findOwnedPeriod(institutionId: number, id: number) {
  const period = await prisma.reportingPeriod.findFirst({ where: { id, institutionId } });
  if (!period) throw ApiError.notFound("Reporting period not found");
  return period;
}

async function dataChangesSince(institutionId: number, since: Date | null): Promise<number> {
  if (!since) return 0;
  return prisma.auditLogEntry.count({
    where: {
      occurredAt: { gt: since },
      entityType: { in: DATA_ENTITY_TYPES },
      user: { institutionId },
    },
  });
}

async function loadFacts(institutionId: number, periodId: number): Promise<CloseoutFacts> {
  const period = await findOwnedPeriod(institutionId, periodId);
  const computed = await prisma.cplCalculationResult.aggregate({
    where: { reportingPeriodId: periodId },
    _max: { computedAt: true },
  });
  const computedAt = computed._max.computedAt;

  const [
    openErrorCount,
    warningCount,
    changesSinceComputed,
    changesSinceValidated,
    changesSinceSignOff,
  ] = await Promise.all([
    prisma.validationIssue.count({
      where: { reportingPeriodId: periodId, resolvedAt: null, severity: "ERROR" },
    }),
    prisma.validationIssue.count({
      where: { reportingPeriodId: periodId, resolvedAt: null, severity: "WARNING" },
    }),
    dataChangesSince(institutionId, computedAt),
    dataChangesSince(institutionId, period.validatedAt),
    dataChangesSince(institutionId, period.signedOffAt),
  ]);

  // Off-track program metrics (from the My Programs assessment) and which of them already have a plan.
  const offTrackWithoutPlan: CloseoutFacts["offTrackWithoutPlan"] = [];
  let offTrackTotal = 0;
  if (computedAt) {
    const dashboard = await buildProgramDashboard(institutionId, null, periodId);
    const plans = await prisma.improvementPlan.findMany({
      where: { reportingPeriodId: periodId, status: { not: "CLOSED" } },
      select: { programId: true, metric: true },
    });
    for (const program of dashboard.programs) {
      for (const [metric, m] of Object.entries(program.metrics)) {
        if (m?.status !== "OFF_TRACK") continue;
        offTrackTotal++;
        if (!plans.some((p) => p.programId === program.programId && p.metric === metric)) {
          offTrackWithoutPlan.push({ programName: program.name, metric });
        }
      }
    }
  }

  return {
    status: period.status,
    outcomesDeadline: period.outcomesDeadline,
    computedAt,
    validatedAt: period.validatedAt,
    changesSinceComputed,
    changesSinceValidated,
    changesSinceSignOff,
    openErrorCount,
    warningCount,
    offTrackWithoutPlan,
    offTrackTotal,
    signedOffAt: period.signedOffAt,
    signedOffBy: period.signedOffBy,
    signedOffNote: period.signedOffNote,
    signedOffResultsAt: period.signedOffResultsAt,
    finalizedAt: period.finalizedAt,
    finalizeOverrideReason: period.finalizeOverrideReason,
  };
}

/** Evaluated fresh on every call (never stored) — used by the checklist screen and by finalize itself. */
export async function evaluatePeriodCloseout(
  institutionId: number,
  periodId: number,
): Promise<CloseoutEvaluation & { facts: CloseoutFacts }> {
  const facts = await loadFacts(institutionId, periodId);
  return { ...evaluateCloseout(facts), facts };
}

export async function show(req: Request, res: Response) {
  const evaluation = await evaluatePeriodCloseout(req.user!.institutionId, Number(req.params.id));
  const { facts, ...rest } = evaluation;
  sendData(res, {
    ...rest,
    status: facts.status,
    signOff: facts.signedOffAt && {
      at: facts.signedOffAt,
      by: facts.signedOffBy,
      note: facts.signedOffNote,
    },
    finalizeOverrideReason: facts.finalizeOverrideReason,
  });
}

export const signOffSchema = z.object({ note: z.string().trim().max(2000).optional() });
type SignOffInput = z.infer<typeof signOffSchema>;

/**
 * The reviewer's confirmation, recorded against the exact results it vouches
 * for. Never overridable, and it goes stale if results, validation or data
 * change afterwards (see evaluateCloseout).
 */
export async function signOff(req: Request<{ id: string }, unknown, SignOffInput>, res: Response) {
  const id = Number(req.params.id);
  const { facts } = await evaluatePeriodCloseout(req.user!.institutionId, id);
  if (facts.status === "FINALIZED" || facts.status === "SUBMITTED") {
    throw ApiError.conflict(
      "This period is already finalized — reopen it before signing off again",
    );
  }
  if (!facts.computedAt) throw ApiError.conflict("Compute results before signing off");
  if (!facts.validatedAt) throw ApiError.conflict("Run validation before signing off");

  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { name: true },
  });
  await prisma.reportingPeriod.update({
    where: { id },
    data: {
      signedOffAt: new Date(),
      signedOffBy: user?.name ?? String(req.user!.sub),
      signedOffNote: req.body.note || null,
      signedOffResultsAt: facts.computedAt,
    },
  });
  await show(req as unknown as Request, res);
}
