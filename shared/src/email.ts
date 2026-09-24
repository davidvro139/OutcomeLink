/** Email delivery (docs/TODO.md): what a recorded email was for, and how it went. */
export const EMAIL_PURPOSES = [
  "INVITATION",
  "PASSWORD_RESET",
  "GRADUATE_SURVEY",
  "EMPLOYER_SURVEY",
  "STAFF_NOTIFICATION",
] as const;
export type EmailPurpose = (typeof EMAIL_PURPOSES)[number];

export const EMAIL_PURPOSE_LABELS: Record<EmailPurpose, string> = {
  INVITATION: "User invitation",
  PASSWORD_RESET: "Password reset",
  GRADUATE_SURVEY: "Graduate survey",
  EMPLOYER_SURVEY: "Employer survey",
  STAFF_NOTIFICATION: "Staff notification",
};

export const EMAIL_DELIVERY_STATUSES = ["SENT", "FAILED"] as const;
export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

/** What happened to an email a request asked for; SKIPPED means none was attempted (see `reason`). */
export type EmailSendStatus = EmailDeliveryStatus | "SKIPPED";
