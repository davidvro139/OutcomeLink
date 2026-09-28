import type { JobContext } from "../../lib/jobRunner";
import { DEFAULT_BACKOFF_MS, registerJob } from "../../lib/jobRunner";
import { generateReportExport } from "./reportExportJobs";

interface ScheduledReportJobParams {
  reportExportJobId: number;
}

/**
 * Scheduled report export job: generates a queued report in the background.
 * Institution-scoped (runs within the requester's institution and access scope).
 * Manual trigger from the export queue, background execution.
 */
registerJob({
  type: "SCHEDULED_REPORT",
  maxAttempts: 3,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async (ctx: JobContext) => {
    const { reportExportJobId } = ctx.params as ScheduledReportJobParams;
    if (!reportExportJobId) throw new Error("reportExportJobId is required");
    await generateReportExport(reportExportJobId);
    return { reportExportJobId };
  },
});
