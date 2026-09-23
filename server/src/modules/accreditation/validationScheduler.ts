import { DEFAULT_BACKOFF_MS, JobPartialFailure, registerJob, runJob } from "../../lib/jobRunner";
import { prisma } from "../../lib/prisma";
import { ACTIVE_REPORTING_PERIOD_STATUSES } from "../../lib/reportingPeriods";
import { runValidationAndNotify } from "./validation";

/**
 * Advanced Workflow Automation (Phase 3, docs/TODO.md): runs validation
 * automatically overnight, in addition to the existing manual "Run
 * Validation" button, for every reporting period across every institution
 * that's still active (not FINALIZED/SUBMITTED) — so newly-introduced issues
 * (e.g. from a bulk import) surface even if nobody happens to click the
 * button. One tracked job run per institution; within it, one failing
 * period's validation doesn't stop the rest, and a retry re-runs only the
 * periods that failed (JobPartialFailure narrows its params) rather than
 * re-validating and re-notifying the ones that succeeded.
 */
async function validateInstitution({
  institutionId,
  params,
}: {
  institutionId: number | null;
  params: Record<string, unknown>;
}) {
  const onlyIds = Array.isArray(params.periodIds) ? (params.periodIds as number[]) : undefined;
  const periods = await prisma.reportingPeriod.findMany({
    where: {
      institutionId: institutionId!,
      status: { in: [...ACTIVE_REPORTING_PERIOD_STATUSES] },
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
    },
    select: { id: true, institutionId: true },
  });

  const failed: { id: number; message: string }[] = [];
  for (const period of periods) {
    try {
      await runValidationAndNotify(period.id, period.institutionId);
    } catch (err) {
      failed.push({ id: period.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
  if (failed.length > 0) {
    throw new JobPartialFailure(
      `Validation failed for ${failed.length} of ${periods.length} reporting period(s): ${failed.map((f) => `#${f.id} (${f.message})`).join("; ")}`,
      { periodIds: failed.map((f) => f.id) },
    );
  }
  return { periodsValidated: periods.length };
}

async function enqueueNightlyValidation(): Promise<void> {
  const active = await prisma.reportingPeriod.findMany({
    where: { status: { in: [...ACTIVE_REPORTING_PERIOD_STATUSES] } },
    select: { institutionId: true },
    distinct: ["institutionId"],
  });
  for (const { institutionId } of active) {
    await runJob("NIGHTLY_VALIDATION", { institutionId, trigger: "SCHEDULE" });
  }
}

registerJob({
  type: "NIGHTLY_VALIDATION",
  maxAttempts: 3,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: validateInstitution,
  schedule: { cron: "0 2 * * *", trigger: enqueueNightlyValidation },
});

/** Runs the nightly pass now (used by tests); the real cron tick calls the same enqueue. */
export const runNightlyValidation = enqueueNightlyValidation;
