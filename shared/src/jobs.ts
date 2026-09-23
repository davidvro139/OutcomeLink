/** Background job types tracked in the job history (docs/TODO.md's reusable scheduled-job infrastructure). */
export const JOB_TYPES = [
  "SCHEDULED_REPORT",
  "NIGHTLY_VALIDATION",
  "FOLLOW_UP_AUTOMATION",
  "GRADUATE_CAMPAIGN",
  "MISSING_OUTCOMES_DIGEST",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  SCHEDULED_REPORT: "Scheduled report",
  NIGHTLY_VALIDATION: "Nightly validation",
  FOLLOW_UP_AUTOMATION: "Follow-up automation",
  GRADUATE_CAMPAIGN: "Graduate outreach campaign",
  MISSING_OUTCOMES_DIGEST: "Missing-outcomes digest",
};

export const JOB_RUN_STATUSES = ["RUNNING", "RETRY_PENDING", "SUCCESS", "FAILED"] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export const JOB_TRIGGERS = ["SCHEDULE", "MANUAL"] as const;
export type JobTrigger = (typeof JOB_TRIGGERS)[number];
