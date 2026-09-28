import type { JobContext } from "../../lib/jobRunner";
import { DEFAULT_BACKOFF_MS, registerJob, JobPartialFailure } from "../../lib/jobRunner";
import { prisma } from "../../lib/prisma";

interface GraduateCampaignJobParams {
  /** Cohort of graduates to send surveys to (e.g. "Fall 2024 completers") */
  cohortLabel?: string;
  /** How many to process in this attempt (if restarting, narrower than on first try) */
  limit?: number;
}

/**
 * Graduate outreach campaign job: sends graduate surveys to a cohort of completers.
 * Institution-scoped. Manual trigger from campaigns admin UI or scheduled basis.
 *
 * Implementation deferred: placeholder structure in place for integration.
 * Will need campaign definition, recipient filtering, and survey-send logic.
 */
registerJob({
  type: "GRADUATE_CAMPAIGN",
  maxAttempts: 3,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async (ctx: JobContext) => {
    const params = ctx.params as GraduateCampaignJobParams;
    // TODO: Implement campaign sending logic
    // 1. Load campaign definition for this job
    // 2. Query graduates matching the cohort criteria
    // 3. Send surveys in batches
    // 4. On partial failure, throw JobPartialFailure with remaining recipients
    // 5. Return { sent: X, failed: Y }
    console.log(
      `[TODO] Graduate campaign job not yet implemented. Params:`,
      params
    );
    return { status: "not_implemented_yet" };
  },
});

interface MissingOutcomesDigestJobParams {
  /** How many days overdue before including in digest (e.g. 7, 30) */
  overdueThresholdDays?: number;
}

/**
 * Missing-outcomes digest job: aggregates missing or stale outcome records
 * across an institution and sends a summary to administrators.
 * Institution-scoped. Scheduled nightly to surface data quality issues.
 *
 * Implementation deferred: placeholder structure in place for integration.
 * Will need query logic for missing outcomes, digest formatting, and email sending.
 */
registerJob({
  type: "MISSING_OUTCOMES_DIGEST",
  maxAttempts: 2,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async (ctx: JobContext) => {
    const params = ctx.params as MissingOutcomesDigestJobParams;
    const institutionId = ctx.institutionId;
    if (!institutionId) {
      throw new Error(
        "MISSING_OUTCOMES_DIGEST must be institution-scoped, not system-wide"
      );
    }
    // TODO: Implement digest logic
    // 1. Query enrollments missing completion/placement/licensure outcomes
    // 2. Filter by overdueThreshold
    // 3. Group by program for readability
    // 4. Format digest (HTML email)
    // 5. Send to institution administrators
    // 6. Log that digest was sent
    console.log(
      `[TODO] Missing outcomes digest not yet implemented. Institution: ${institutionId}, Params:`,
      params
    );
    return { status: "not_implemented_yet" };
  },
});
