import type { JobContext } from "../../lib/jobRunner";
import { DEFAULT_BACKOFF_MS, registerJob } from "../../lib/jobRunner";
import { runFollowUpAutomation } from "./automationScheduler";

/**
 * Follow-up automation job: automatically creates follow-up work for outcomes
 * that need attention (e.g., unverified employment, missing licensure results).
 * System-wide job (institutionId: null), triggered on a nightly schedule.
 */
registerJob({
  type: "FOLLOW_UP_AUTOMATION",
  maxAttempts: 3,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async (ctx: JobContext) => {
    const result = await runFollowUpAutomation();
    return result;
  },
  schedule: {
    cron: "0 1 * * *", // 1 AM daily
    trigger: async () => {
      const { runJob } = await import("../../lib/jobRunner");
      await runJob("FOLLOW_UP_AUTOMATION", {
        institutionId: null,
        trigger: "SCHEDULE",
      });
    },
  },
});
