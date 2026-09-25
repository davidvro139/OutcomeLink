import type { Request, Response } from "express";
import {
  BUILT_IN_REPORT_TYPES,
  BUILT_IN_REPORT_TYPES_REQUIRING_PERIOD,
  SCHEDULED_REPORT_FREQUENCIES,
} from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { scheduledReportStorage } from "../../lib/storage";
import { computeNextRunAt, runSubscription } from "./scheduler";

const INSTITUTION_WIDE_ROLES = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

const baseFields = {
  name: z.string().trim().min(1).max(200),
  frequency: z.enum(SCHEDULED_REPORT_FREQUENCIES),
};

/**
 * A subscription points at exactly one of two report sources — enforced
 * here via a discriminated union rather than two nullable fields a caller
 * could set both (or neither) of, even though the DB columns themselves are
 * both nullable (schema.prisma's ScheduledReportSubscription doc comment
 * explains why the DB doesn't also enforce this).
 */
export const createScheduledReportSubscriptionSchema = z.discriminatedUnion("reportSource", [
  z.object({
    ...baseFields,
    reportSource: z.literal("SAVED_REPORT"),
    savedReportId: z.coerce.number().int().positive(),
  }),
  z.object({
    ...baseFields,
    reportSource: z.literal("BUILT_IN"),
    builtInReportType: z.enum(BUILT_IN_REPORT_TYPES),
    // Omitted = "resolve to whatever's the current reporting period at each
    // run" (see builtInReports.ts) rather than fixed forever at subscribe time.
    reportingPeriodId: z.coerce.number().int().positive().optional(),
  }),
]);
export type CreateScheduledReportSubscriptionInput = z.infer<typeof createScheduledReportSubscriptionSchema>;

export const updateScheduledReportSubscriptionSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  frequency: z.enum(SCHEDULED_REPORT_FREQUENCIES).optional(),
  active: z.boolean().optional(),
});
export type UpdateScheduledReportSubscriptionInput = z.infer<typeof updateScheduledReportSubscriptionSchema>;

const subscriptionInclude = {
  savedReport: { select: { id: true, name: true } },
  reportingPeriod: { select: { id: true, label: true } },
  creator: { select: { id: true, name: true } },
  runs: { orderBy: { runAt: "desc" as const }, take: 1 },
} as const;

/**
 * A run's file is a static snapshot generated with its creator's access
 * scope baked in at run time (unlike a SavedReport's definition, which is
 * re-validated and re-scoped fresh for whoever runs it) — sharing it
 * unrestricted the way SavedReport itself is institution-wide would either
 * leak more than a viewer's own entitlements (if the creator was
 * unrestricted) or show them less (if the creator was scoped), neither of
 * which is what "institution-wide shared" is supposed to mean. So unlike
 * SavedReport, a subscription (and its runs) is visible only to its creator
 * or an institution-wide administrator.
 */
async function findVisibleSubscription(req: Request, id: number) {
  const institutionId = req.user!.institutionId;
  const subscription = await prisma.scheduledReportSubscription.findFirst({
    where: {
      id,
      institutionId,
      ...(INSTITUTION_WIDE_ROLES.includes(req.user!.role) ? {} : { createdBy: req.user!.sub }),
    },
  });
  if (!subscription) throw ApiError.notFound("Scheduled report subscription not found");
  return subscription;
}

export async function list(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const subscriptions = await prisma.scheduledReportSubscription.findMany({
    where: {
      institutionId,
      ...(INSTITUTION_WIDE_ROLES.includes(req.user!.role) ? {} : { createdBy: req.user!.sub }),
    },
    include: subscriptionInclude,
    orderBy: { name: "asc" },
  });
  sendData(res, { subscriptions });
}

export async function create(
  req: Request<Record<string, never>, unknown, CreateScheduledReportSubscriptionInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const input = req.body;

  if (input.reportSource === "SAVED_REPORT") {
    const savedReport = await prisma.savedReport.findFirst({
      where: { id: input.savedReportId, institutionId },
    });
    if (!savedReport) throw ApiError.badRequest("Unknown savedReportId");
  } else {
    if (input.reportingPeriodId) {
      const period = await prisma.reportingPeriod.findFirst({
        where: { id: input.reportingPeriodId, institutionId },
      });
      if (!period) throw ApiError.badRequest("Unknown reportingPeriodId");
    } else if (BUILT_IN_REPORT_TYPES_REQUIRING_PERIOD.includes(input.builtInReportType)) {
      const anyPeriodExists = await prisma.reportingPeriod.findFirst({ where: { institutionId } });
      if (!anyPeriodExists) {
        throw ApiError.badRequest(
          "This report requires a reporting period, and this institution doesn't have one yet",
        );
      }
    }
  }

  const now = new Date();

  const subscription = await prisma.scheduledReportSubscription.create({
    data: {
      institutionId,
      name: input.name,
      frequency: input.frequency,
      reportSource: input.reportSource,
      savedReportId: input.reportSource === "SAVED_REPORT" ? input.savedReportId : undefined,
      builtInReportType: input.reportSource === "BUILT_IN" ? input.builtInReportType : undefined,
      reportingPeriodId: input.reportSource === "BUILT_IN" ? input.reportingPeriodId : undefined,
      createdBy: req.user!.sub,
      // First automatic run happens one full cycle from now, not
      // immediately — "Run Now" already covers wanting one right away.
      nextRunAt: computeNextRunAt(input.frequency, now),
    },
    include: subscriptionInclude,
  });
  sendData(res, { subscription }, 201);
}

export async function update(
  req: Request<{ id: string }, unknown, UpdateScheduledReportSubscriptionInput>,
  res: Response,
) {
  const subscription = await findVisibleSubscription(req, Number(req.params.id));
  const { frequency, ...rest } = req.body;

  const subscriptionUpdated = await prisma.scheduledReportSubscription.update({
    where: { id: subscription.id },
    data: {
      ...rest,
      ...(frequency ? { frequency, nextRunAt: computeNextRunAt(frequency, new Date()) } : {}),
    },
    include: subscriptionInclude,
  });
  sendData(res, { subscription: subscriptionUpdated });
}

export async function remove(req: Request, res: Response) {
  const subscription = await findVisibleSubscription(req, Number(req.params.id));
  // Notification has no real FK to ScheduledReportRun (referenceEntityId is a generic
  // polymorphic pointer), so the cascade delete on the subscription's runs wouldn't clean
  // these up on its own — done explicitly here to avoid leaving dead-download-link
  // notifications behind (found in browser verification).
  const runs = await prisma.scheduledReportRun.findMany({
    where: { subscriptionId: subscription.id },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.notification.deleteMany({
      where: {
        type: "SCHEDULED_REPORT_READY",
        referenceEntityType: "ScheduledReportRun",
        referenceEntityId: { in: runs.map((r) => r.id) },
      },
    }),
    prisma.scheduledReportSubscription.delete({ where: { id: subscription.id } }),
  ]);
  sendData(res, { deleted: true });
}

export async function runNow(req: Request, res: Response) {
  const subscription = await findVisibleSubscription(req, Number(req.params.id));
  const run = await runSubscription(subscription.id);
  sendData(res, { run }, 201);
}

export async function listRuns(req: Request, res: Response) {
  const subscription = await findVisibleSubscription(req, Number(req.params.id));
  const runs = await prisma.scheduledReportRun.findMany({
    where: { subscriptionId: subscription.id },
    orderBy: { runAt: "desc" },
  });
  sendData(res, { runs });
}

export async function downloadRun(req: Request, res: Response) {
  const runId = Number(req.params.runId);
  const run = await prisma.scheduledReportRun.findUnique({ where: { id: runId } });
  if (!run) throw ApiError.notFound("Report run not found");
  await findVisibleSubscription(req, run.subscriptionId);
<<<<<<< HEAD
  if (!run.fileReference) throw ApiError.notFound("This run has no generated file (it may have failed)");
=======
  if (!run.fileReference) {
    throw ApiError.notFound(
      run.status === "SUCCESS"
        ? "This run's file has expired and was removed (see Settings, Data retention) — use Run Now for a fresh copy"
        : "This run has no generated file (it may have failed)",
    );
  }
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

  const buffer = await scheduledReportStorage.load(run.fileReference);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="scheduled-report-${run.id}.xlsx"`);
  res.send(buffer);
}
