import type { JobContext } from "../../lib/jobRunner";
import { DEFAULT_BACKOFF_MS, registerJob } from "../../lib/jobRunner";
import { generateReportExport } from "./reportExportJobs";
import { prisma } from "../../lib/prisma";
import { runSubscription } from "../scheduledReports/scheduler";

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
    if (typeof ctx.params.subscriptionId === "number") {
      const subscription = await prisma.scheduledReportSubscription.findFirst({
        where: { id: ctx.params.subscriptionId, ...(ctx.institutionId !== null ? { institutionId: ctx.institutionId } : {}) },
      });
      if (!subscription) return { skipped: "Subscription no longer exists" };
      const run = await runSubscription(subscription.id, ctx.isFinalAttempt);
      if (run.status === "FAILED") throw new Error(run.errorMessage ?? "Report generation failed");
      return { scheduledReportRunId: run.id };
    }
    const { reportExportJobId } = ctx.params;
    if (typeof reportExportJobId !== "number" || !Number.isInteger(reportExportJobId) || reportExportJobId <= 0) throw new Error("reportExportJobId is required");
    await generateReportExport(reportExportJobId);
    return { reportExportJobId };
  },
});
