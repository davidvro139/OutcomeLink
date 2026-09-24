/** Program dashboard (docs/TODO.md): how a program stands against a benchmark for one metric. */
export const RISK_STATUSES = ["MEETING", "AT_RISK", "OFF_TRACK", "NO_DATA"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  MEETING: "Meeting benchmark",
  AT_RISK: "At risk",
  OFF_TRACK: "Off track",
  NO_DATA: "No data",
};

/** Worst first, for ordering and for the program's overall status. */
export const RISK_STATUS_SEVERITY: Record<RiskStatus, number> = {
  OFF_TRACK: 3,
  AT_RISK: 2,
  MEETING: 1,
  NO_DATA: 0,
};

/** "Recompute now" refuses a period that was computed more recently than this. */
export const RECOMPUTE_MIN_INTERVAL_MINUTES = 5;

/** Results older than this many days are called out as stale on an active period. */
export const STALE_RESULTS_DAYS = 7;
