import type { Request, Response } from "express";
import cron from "node-cron";
import { sendData } from "../../lib/apiResponse";
import { runFollowUpAutoAssignment } from "./assignment";
import { runFollowUpEscalation } from "./escalation";

/** Auto-assignment before escalation — a student that gets assigned this same run is deliberately not yet overdue-eligible. */
export async function runFollowUpAutomation() {
  const assignment = await runFollowUpAutoAssignment();
  const escalation = await runFollowUpEscalation();
  return { ...assignment, ...escalation };
}

/** Manual "Run Now" — the exact same job the cron tick runs, so a manual and automatic run can never behave differently. */
export async function runNow(_req: Request, res: Response) {
  const result = await runFollowUpAutomation();
  sendData(res, result, 201);
}

/**
 * Daily, alongside the hourly Scheduled Reports tick and the nightly
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
