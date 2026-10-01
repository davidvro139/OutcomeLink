import type { JobContext } from "../../lib/jobRunner";
import { DEFAULT_BACKOFF_MS, registerJob, JobPartialFailure } from "../../lib/jobRunner";
import { prisma } from "../../lib/prisma";
import { ACTIVE_REPORTING_PERIOD_STATUSES } from "../../lib/reportingPeriods";
import { runValidationAndNotify } from "./validation";

/**
 * Nightly validation runs institution-wide: runs validation for every active
 * reporting period and surfaces newly-introduced issues via notifications.
 * System-wide job (institutionId: null), triggered on a nightly schedule.
 */
registerJob({
  type: "NIGHTLY_VALIDATION",
  maxAttempts: 3,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async (ctx: JobContext) => {
    const periodIds = Array.isArray(ctx.params.periodIds) ? ctx.params.periodIds.filter((id): id is number => typeof id === "number") : undefined;
    const periods = await prisma.reportingPeriod.findMany({ where: {
      status: { in: [...ACTIVE_REPORTING_PERIOD_STATUSES] },
      ...(ctx.institutionId !== null ? { institutionId: ctx.institutionId } : {}),
      ...(periodIds ? { id: { in: periodIds } } : {}),
    }, select: { id: true, institutionId: true } });
    const failed: number[] = [];
    for (const period of periods) {
      try { await runValidationAndNotify(period.id, period.institutionId); }
      catch { failed.push(period.id); }
    }
    if (failed.length) throw new JobPartialFailure(`Validation failed for ${failed.map((id) => `#${id}`).join(", ")}`, { periodIds: failed });
    return { periodsValidated: periods.length };
  },
  schedule: {
    cron: "0 2 * * *", // 2 AM daily
    trigger: async () => {
      const { runJob } = await import("../../lib/jobRunner");
      await runJob("NIGHTLY_VALIDATION", {
        institutionId: null,
        trigger: "SCHEDULE",
      });
    },
  },
});
