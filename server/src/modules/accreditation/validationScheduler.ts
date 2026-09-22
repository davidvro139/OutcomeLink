import cron from "node-cron";
import { prisma } from "../../lib/prisma";
import { ACTIVE_REPORTING_PERIOD_STATUSES } from "../../lib/reportingPeriods";
import { runValidationAndNotify } from "./validation";

/**
 * Advanced Workflow Automation (Phase 3, docs/TODO.md): runs validation
 * automatically overnight, in addition to the existing manual "Run
 * Validation" button, for every reporting period across every institution
 * that's still active (not FINALIZED/SUBMITTED) — so newly-introduced issues
 * (e.g. from a bulk import) surface even if nobody happens to click the
 * button. One failing period's validation doesn't stop the rest of the
 * batch from running.
 */
export async function runNightlyValidation(): Promise<void> {
  const periods = await prisma.reportingPeriod.findMany({
    where: { status: { in: [...ACTIVE_REPORTING_PERIOD_STATUSES] } },
    select: { id: true, institutionId: true },
  });
  for (const period of periods) {
    try {
      await runValidationAndNotify(period.id, period.institutionId);
    } catch (err) {
      console.error(`Nightly validation failed for reporting period ${period.id}`, err);
    }
  }
}

/** Only reached from the real server entrypoint (see server/src/index.ts), never from tests. */
export function startNightlyValidationScheduler(): void {
  cron.schedule("0 2 * * *", () => {
    void runNightlyValidation();
  });
}
