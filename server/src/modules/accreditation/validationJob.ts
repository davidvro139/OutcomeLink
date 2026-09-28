import type { JobContext } from "../../lib/jobRunner";
import { DEFAULT_BACKOFF_MS, registerJob } from "../../lib/jobRunner";
import { runNightlyValidation } from "./validationScheduler";

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
    await runNightlyValidation();
    return {};
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
