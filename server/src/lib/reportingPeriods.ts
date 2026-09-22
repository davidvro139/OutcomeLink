import type { ReportingPeriodStatus } from "@prisma/client";

/**
 * Reporting periods still being actively worked on, as opposed to
 * FINALIZED/SUBMITTED ones that are locked. Shared by Advanced Workflow
 * Automation's (Phase 3, docs/TODO.md) two nightly jobs — follow-up
 * auto-assignment/escalation and the nightly validation re-run — so the two
 * can never disagree about which periods are still in scope for automation.
 */
export const ACTIVE_REPORTING_PERIOD_STATUSES: readonly ReportingPeriodStatus[] = [
  "OPEN",
  "READY_FOR_REVIEW",
  "REOPENED",
];
