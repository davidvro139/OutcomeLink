import type { Request, Response } from "express";
<<<<<<< HEAD
import cron from "node-cron";
import { sendData } from "../../lib/apiResponse";
=======
import { sendData } from "../../lib/apiResponse";
import { DEFAULT_BACKOFF_MS, registerJob, runJob } from "../../lib/jobRunner";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import { runFollowUpAutoAssignment } from "./assignment";
import { runFollowUpEscalation } from "./escalation";

/** Auto-assignment before escalation — a student that gets assigned this same run is deliberately not yet overdue-eligible. */
export async function runFollowUpAutomation() {
  const assignment = await runFollowUpAutoAssignment();
  const escalation = await runFollowUpEscalation();
  return { ...assignment, ...escalation };
}

/** Manual "Run Now" — the exact same job the cron tick runs, so a manual and automatic run can never behave differently. */
<<<<<<< HEAD
export async function runNow(_req: Request, res: Response) {
  const result = await runFollowUpAutomation();
  sendData(res, result, 201);
=======
export async function runNow(req: Request, res: Response) {
  const run = await runJob("FOLLOW_UP_AUTOMATION", {
    institutionId: req.user!.institutionId,
    trigger: "MANUAL",
    requestedBy: req.user!.sub,
    rethrow: true,
  });
  sendData(res, run.result, 201);
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}

/**
 * Daily, alongside the hourly Scheduled Reports tick and the nightly
<<<<<<< HEAD
 * validation re-run — a third independent cron registration rather than
 * folding into either of those, so each feature's schedule stays
 * independently reasoned-about. Only reached from the real server
 * entrypoint (see server/src/index.ts), never from tests.
 */
export function startFollowUpAutomationScheduler(): void {
  cron.schedule("0 6 * * *", () => {
    void runFollowUpAutomation();
  });
}
=======
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
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
