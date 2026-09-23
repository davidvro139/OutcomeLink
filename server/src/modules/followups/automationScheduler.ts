import type { Request, Response } from "express";
import { sendData } from "../../lib/apiResponse";
import { DEFAULT_BACKOFF_MS, registerJob, runJob } from "../../lib/jobRunner";
import { runFollowUpAutoAssignment } from "./assignment";
import { runFollowUpEscalation } from "./escalation";

/** Auto-assignment before escalation — a student that gets assigned this same run is deliberately not yet overdue-eligible. */
export async function runFollowUpAutomation() {
  const assignment = await runFollowUpAutoAssignment();
  const escalation = await runFollowUpEscalation();
  return { ...assignment, ...escalation };
}

/** Manual "Run Now" — the exact same job the cron tick runs, so a manual and automatic run can never behave differently. */
export async function runNow(req: Request, res: Response) {
  const run = await runJob("FOLLOW_UP_AUTOMATION", {
    institutionId: req.user!.institutionId,
    trigger: "MANUAL",
    requestedBy: req.user!.sub,
    rethrow: true,
  });
  sendData(res, run.result, 201);
}

/**
 * Daily, alongside the hourly Scheduled Reports tick and the nightly
 * validation re-run — each feature keeps its own schedule, now all driven by
 * the shared job runner (retries with backoff, history). A system-wide job
 * (it loops every institution itself), so its scheduled runs have no
 * institution of their own.
 */
registerJob({
  type: "FOLLOW_UP_AUTOMATION",
  maxAttempts: 3,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async () => ({ ...(await runFollowUpAutomation()) }),
  schedule: {
    cron: "0 6 * * *",
    trigger: async () => {
      await runJob("FOLLOW_UP_AUTOMATION", { institutionId: null, trigger: "SCHEDULE" });
    },
  },
});
