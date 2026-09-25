import type { EmailSendStatus } from "@outcomelink/shared";

/** Fields the server adds to a response when it was asked to send an email. */
export interface EmailResult {
  emailStatus?: EmailSendStatus;
  emailReason?: string;
}

/**
 * Wording for a survey-created toast. "Email is not configured" (and no
 * email status at all, for non-EMAIL channels) keeps the original
 * copy-the-link message; a real send or a real problem says so.
 */
export function surveyToast(
  kind: "Graduate" | "Employer",
  result: EmailResult,
): { message: string; color: string } {
  const copyHint = "copy the link below to send it yourself";
  if (result.emailStatus === "SENT") return { message: `${kind} survey emailed`, color: "green" };
  if (result.emailStatus === "FAILED") {
    return {
      message: `${kind} survey created, but the email failed (${result.emailReason}) — ${copyHint}`,
      color: "yellow",
    };
  }
  if (result.emailStatus === "SKIPPED" && result.emailReason !== "Email is not configured") {
    return {
      message: `${kind} survey created, not emailed (${result.emailReason}) — ${copyHint}`,
      color: "yellow",
    };
  }
  return { message: `${kind} survey created — ${copyHint}`, color: "green" };
}
