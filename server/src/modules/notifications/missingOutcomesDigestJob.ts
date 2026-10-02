import type { JobContext } from "../../lib/jobRunner";
import { DEFAULT_BACKOFF_MS, JobPartialFailure, registerJob } from "../../lib/jobRunner";
import { prisma } from "../../lib/prisma";
import { ACTIVE_REPORTING_PERIOD_STATUSES } from "../../lib/reportingPeriods";
import { sendMissingOutcomesDigest } from "./missingOutcomesDigest";

/**
 * Each morning, one digest per active reporting period. 5:00 is clear of
 * follow-up automation (1:00), nightly validation (2:00), retention (3:30),
 * the at-risk check (7:00), and the backup check (8:00). A period with
 * nobody unresolved sends nothing. A failed period is retried alone.
 */
registerJob({
  type: "MISSING_OUTCOMES_DIGEST",
  maxAttempts: 3,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async (ctx: JobContext) => {
    const periodIds = Array.isArray(ctx.params.periodIds)
      ? ctx.params.periodIds.filter((id): id is number => typeof id === "number")
      : undefined;
    const periods = await prisma.reportingPeriod.findMany({
      where: {
        status: { in: [...ACTIVE_REPORTING_PERIOD_STATUSES] },
        ...(ctx.institutionId !== null ? { institutionId: ctx.institutionId } : {}),
        ...(periodIds ? { id: { in: periodIds } } : {}),
      },
      select: { id: true, institutionId: true },
    });
    const failed: number[] = [];
    let digestsSent = 0;
    for (const period of periods) {
      try {
        const result = await sendMissingOutcomesDigest(period.institutionId, period.id);
        if (result && result.recipientCount > 0) digestsSent += 1;
      } catch {
        failed.push(period.id);
      }
    }
    if (failed.length) {
      throw new JobPartialFailure(
        `Missing-outcomes digest failed for ${failed.map((id) => `#${id}`).join(", ")}`,
        { periodIds: failed },
      );
    }
    return { periodsChecked: periods.length, digestsSent };
  },
  schedule: {
    cron: "0 5 * * *",
    trigger: async () => {
      const { runJob } = await import("../../lib/jobRunner");
      await runJob("MISSING_OUTCOMES_DIGEST", { institutionId: null, trigger: "SCHEDULE" });
    },
  },
});
