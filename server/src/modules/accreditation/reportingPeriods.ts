import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { evaluatePeriodCloseout } from "./closeout";

export const createReportingPeriodSchema = z.object({
  ruleSetId: z.coerce.number().int().positive(),
  label: z.string().trim().min(1).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  // Distinct from endDate — see the schema.prisma doc comment on this column.
  outcomesDeadline: z.coerce.date().optional(),
});
type CreateReportingPeriodInput = z.infer<typeof createReportingPeriodSchema>;

export const updateReportingPeriodSchema = z.object({
  outcomesDeadline: z.coerce.date().nullable().optional(),
});
type UpdateReportingPeriodInput = z.infer<typeof updateReportingPeriodSchema>;

export async function list(req: Request, res: Response) {
  const reportingPeriods = await prisma.reportingPeriod.findMany({
    where: { institutionId: req.user!.institutionId },
    // id as a tiebreaker: two periods sharing a startDate would otherwise sort
    // unstably, and the Dashboard picks periods[0] as "the current period".
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });
  sendData(res, { reportingPeriods });
}

export async function show(req: Request, res: Response) {
  const reportingPeriod = await prisma.reportingPeriod.findFirst({
    where: { id: Number(req.params.id), institutionId: req.user!.institutionId },
  });
  if (!reportingPeriod) throw ApiError.notFound("Reporting period not found");
  sendData(res, { reportingPeriod });
}

export async function create(
  req: Request<unknown, unknown, CreateReportingPeriodInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;

  if (req.body.endDate <= req.body.startDate) {
    throw ApiError.badRequest("endDate must be after startDate");
  }

  const ruleSet = await prisma.ruleSet.findUnique({ where: { id: req.body.ruleSetId } });
  if (!ruleSet) throw ApiError.badRequest("Unknown ruleSetId");

  const reportingPeriod = await prisma.reportingPeriod.create({
    data: { ...req.body, institutionId },
  });
  sendData(res, { reportingPeriod }, 201);
}

/** Deliberately narrow — only outcomesDeadline is editable post-creation for now; label/dates/ruleSet edits aren't part of this item's scope. */
export async function update(
  req: Request<{ id: string }, unknown, UpdateReportingPeriodInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  await findOwnedPeriod(req.user!.institutionId, id);

  const reportingPeriod = await prisma.reportingPeriod.update({
    where: { id },
    data: { outcomesDeadline: req.body.outcomesDeadline },
  });
  sendData(res, { reportingPeriod });
}

async function findOwnedPeriod(institutionId: number, id: number) {
  const period = await prisma.reportingPeriod.findFirst({ where: { id, institutionId } });
  if (!period) throw ApiError.notFound("Reporting period not found");
  return period;
}

async function actingUserName(userId: number): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? String(userId);
}

/**
 * Finalize/reopen/submit — spec §25. Finalizing freezes the period against
 * further recompute (results.ts's compute() checks this) and outcome-record
 * edits (outcomes.ts checks this); reopening requires a reason and is picked
 * up automatically by the audit-log Prisma extension as an UPDATE on every
 * changed field (status/reopenedAt/reopenedBy/reopenReason), satisfying
 * "reopening must be recorded in the audit trail" without extra code.
 */
export const finalizeReportingPeriodSchema = z.object({
  /** Why finalizing is going ahead with blockers outstanding (required only then). */
  overrideReason: z.string().trim().min(1).max(2000).optional(),
});
type FinalizeReportingPeriodInput = z.infer<typeof finalizeReportingPeriodSchema>;

/**
 * Guarded by the close-out checklist (docs/TODO.md): the period must have been
 * signed off on the current results, and if blockers remain (results missing or
 * stale, validation not current, open errors, off-track programs with no plan)
 * an override reason is required and recorded. The sign-off itself can't be
 * overridden — it is the confirmation that someone looked.
 */
export async function finalize(
  req: Request<{ id: string }, unknown, FinalizeReportingPeriodInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  const period = await findOwnedPeriod(req.user!.institutionId, id);

  if (!["OPEN", "READY_FOR_REVIEW", "REOPENED"].includes(period.status)) {
    throw ApiError.conflict(`Cannot finalize a reporting period with status ${period.status}`);
  }

  const closeout = await evaluatePeriodCloseout(req.user!.institutionId, id);
  if (!closeout.signOffCurrent) {
    throw new ApiError(
      409,
      "CLOSEOUT_BLOCKED",
      "Sign off on the close-out checklist before finalizing — a sign-off is needed on the current results.",
      { blockers: closeout.blockers, signOffRequired: true },
    );
  }
  if (closeout.needsOverride && !req.body.overrideReason) {
    throw new ApiError(
      409,
      "CLOSEOUT_BLOCKED",
      "Finalizing is blocked: " + closeout.blockers.map((b) => b.message).join(" ") + " Provide an override reason to finalize anyway.",
      { blockers: closeout.blockers, signOffRequired: false },
    );
  }

  const finalizedBy = await actingUserName(req.user!.sub);
  const reportingPeriod = await prisma.reportingPeriod.update({
    where: { id },
    data: {
      status: "FINALIZED",
      finalizedAt: new Date(),
      finalizedBy,
      finalizeOverrideReason: closeout.needsOverride ? req.body.overrideReason : null,
    },
  });
  sendData(res, { reportingPeriod });
}

export async function submit(req: Request, res: Response) {
  const id = Number(req.params.id);
  const period = await findOwnedPeriod(req.user!.institutionId, id);

  if (period.status !== "FINALIZED") {
    throw ApiError.conflict("Only a Finalized reporting period can be marked Submitted");
  }

  const reportingPeriod = await prisma.reportingPeriod.update({
    where: { id },
    data: { status: "SUBMITTED" },
  });
  sendData(res, { reportingPeriod });
}

export const reopenReportingPeriodSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});
type ReopenReportingPeriodInput = z.infer<typeof reopenReportingPeriodSchema>;

export async function reopen(
  req: Request<{ id: string }, unknown, ReopenReportingPeriodInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  const period = await findOwnedPeriod(req.user!.institutionId, id);

  if (period.status !== "FINALIZED" && period.status !== "SUBMITTED") {
    throw ApiError.conflict(`Cannot reopen a reporting period with status ${period.status}`);
  }

  const reopenedBy = await actingUserName(req.user!.sub);
  const reportingPeriod = await prisma.reportingPeriod.update({
    where: { id },
    data: {
      status: "REOPENED",
      reopenedAt: new Date(),
      reopenedBy,
      reopenReason: req.body.reason,
      // A reopened period has to be reviewed and signed off again.
      signedOffAt: null,
      signedOffBy: null,
      signedOffNote: null,
      signedOffResultsAt: null,
      finalizeOverrideReason: null,
    },
  });
  sendData(res, { reportingPeriod });
}

/** Used by outcomes.ts and results.ts to refuse edits/recompute against a locked period. */
export async function assertPeriodIsEditable(reportingPeriodId: number) {
  const period = await prisma.reportingPeriod.findUnique({ where: { id: reportingPeriodId } });
  if (period && (period.status === "FINALIZED" || period.status === "SUBMITTED")) {
    throw ApiError.conflict(
      `Reporting period "${period.label}" is ${period.status.toLowerCase()} and must be reopened before it can be changed`,
    );
  }
}
