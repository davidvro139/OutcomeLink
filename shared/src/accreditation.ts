/** The three COE CPL metrics. A student is classified separately per metric — see docs/DATA_MODEL.md §13. */
export const CPL_METRICS = ["COMPLETION", "PLACEMENT", "LICENSURE"] as const;
export type CplMetric = (typeof CPL_METRICS)[number];

export const REPORTING_PERIOD_STATUSES = [
  "OPEN",
  "READY_FOR_REVIEW",
  "FINALIZED",
  "SUBMITTED",
  "REOPENED",
] as const;
export type ReportingPeriodStatus = (typeof REPORTING_PERIOD_STATUSES)[number];

export const VALIDATION_SEVERITIES = ["ERROR", "WARNING", "INFORMATION"] as const;
export type ValidationSeverity = (typeof VALIDATION_SEVERITIES)[number];
