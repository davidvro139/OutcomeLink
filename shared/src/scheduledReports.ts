/**
 * Scheduled Reports (Phase 3, spec §50). No email/SMS infrastructure exists
 * anywhere in this app, so "subscribing" means an automatic recurring run
 * that lands as an in-app Notification with a downloadable generated
 * workbook — not an emailed attachment. A subscription points at exactly one
 * of two report sources: a saved Custom Report Builder definition, or one of
 * the 4 built-in reports spec §50 names by example (see
 * BUILT_IN_REPORT_TYPE_LABELS below for which existing report each maps to).
 */

export const SCHEDULED_REPORT_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"] as const;
export type ScheduledReportFrequency = (typeof SCHEDULED_REPORT_FREQUENCIES)[number];

export const SCHEDULED_REPORT_FREQUENCY_LABELS: Record<ScheduledReportFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
};

export const SCHEDULED_REPORT_SOURCES = ["SAVED_REPORT", "BUILT_IN"] as const;
export type ScheduledReportSource = (typeof SCHEDULED_REPORT_SOURCES)[number];

/**
 * OUTCOME_FUNNEL (P8) for "Monthly Outcomes Summary" — data-completeness
 * through the pipeline. UNKNOWN_OUTCOMES (P8) for "Weekly Missing
 * Verification Report" — exactly the population that still needs chasing
 * down. EMPLOYER_ANALYTICS (P5) for "Quarterly Employer Report".
 * CPL_READINESS (P2) for "Annual CPL Readiness Report".
 */
export const BUILT_IN_REPORT_TYPES = [
  "OUTCOME_FUNNEL",
  "UNKNOWN_OUTCOMES",
  "EMPLOYER_ANALYTICS",
  "CPL_READINESS",
] as const;
export type BuiltInReportType = (typeof BUILT_IN_REPORT_TYPES)[number];

export const BUILT_IN_REPORT_TYPE_LABELS: Record<BuiltInReportType, string> = {
  OUTCOME_FUNNEL: "Outcomes Summary",
  UNKNOWN_OUTCOMES: "Missing Verification Report",
  EMPLOYER_ANALYTICS: "Employer Report",
  CPL_READINESS: "Annual CPL Readiness Report",
};

/** EMPLOYER_ANALYTICS is the one built-in that can run institution-wide/all-time with no period at all, matching its own existing endpoint's default. */
export const BUILT_IN_REPORT_TYPES_REQUIRING_PERIOD: readonly BuiltInReportType[] = [
  "OUTCOME_FUNNEL",
  "UNKNOWN_OUTCOMES",
  "CPL_READINESS",
];

export const SCHEDULED_REPORT_RUN_STATUSES = ["SUCCESS", "FAILED"] as const;
export type ScheduledReportRunStatus = (typeof SCHEDULED_REPORT_RUN_STATUSES)[number];
