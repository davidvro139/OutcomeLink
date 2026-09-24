/** Settings page (docs/TODO.md): how long old operational records are kept before the daily cleanup removes them. */
export const RETENTION_DEFAULTS = {
  /** Finished background-job records, scheduled-report run records and export-job records. */
  jobRunDays: 180,
  /** The email delivery log. */
  emailLogDays: 180,
  /** Notifications the user has already read (unread ones are never removed). */
  notificationDays: 90,
  /** Generated export and scheduled-report files (the record stays; the file is removed). */
  exportFileDays: 30,
} as const;

export type RetentionSettings = { [K in keyof typeof RETENTION_DEFAULTS]: number };

export const RETENTION_MIN_DAYS = 7;
export const RETENTION_MAX_DAYS = 3650;

export const RETENTION_LABELS: Record<keyof RetentionSettings, string> = {
  jobRunDays: "Job history and run records",
  emailLogDays: "Email log",
  notificationDays: "Read notifications",
  exportFileDays: "Generated export files",
};
