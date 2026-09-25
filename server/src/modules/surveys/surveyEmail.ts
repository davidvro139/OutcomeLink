import { publicUrl } from "../../lib/appUrls";
import {
  deliverEmail,
  EMAIL_NOT_CONFIGURED,
  employerContactTarget,
  institutionName,
  studentEmailTarget,
  type EmailOutcome,
} from "../../lib/emailDelivery";
import { employerSurveyEmail, graduateSurveyEmail } from "../../lib/emailTemplates";

/** Emails a graduate survey link to its student, unless they can't be contacted (see studentEmailTarget). */
export async function sendGraduateSurveyEmail(
  institutionId: number,
  survey: { id: number; studentId: number; responseToken: string },
): Promise<EmailOutcome> {
  const target = await studentEmailTarget(survey.studentId);
  if ("skipped" in target) return { status: "SKIPPED", reason: target.skipped };
  return deliverEmail({
    institutionId,
    purpose: "GRADUATE_SURVEY",
    to: target.email,
    content: graduateSurveyEmail({
      firstName: target.firstName,
      institutionName: await institutionName(institutionId),
      url: publicUrl(`/survey/graduate/${survey.responseToken}`),
    }),
    relatedEntityType: "GraduateSurvey",
    relatedEntityId: survey.id,
  });
}

/** Emails an employer survey link to one of the employer's contacts (see employerContactTarget for which). */
export async function sendEmployerSurveyEmail(
  institutionId: number,
  survey: { id: number; responseToken: string },
  employerId: number,
  studentName: string,
  contactId?: number,
): Promise<EmailOutcome> {
  const target = await employerContactTarget(employerId, contactId);
  if ("skipped" in target) return { status: "SKIPPED", reason: target.skipped };
  return deliverEmail({
    institutionId,
    purpose: "EMPLOYER_SURVEY",
    to: target.email,
    content: employerSurveyEmail({
      contactName: target.name,
      studentName,
      institutionName: await institutionName(institutionId),
      url: publicUrl(`/survey/employer/${survey.responseToken}`),
    }),
    relatedEntityType: "EmployerSurvey",
    relatedEntityId: survey.id,
  });
}

/**
 * The outcome worth mentioning in a survey's timeline entry: with email not
 * configured nothing was attempted, so the entry keeps its plain "sent" wording
 * (staff are passing the link along themselves, as before).
 */
export function noteworthy(outcome: EmailOutcome | null): EmailOutcome | null {
  return outcome && !(outcome.status === "SKIPPED" && outcome.reason === EMAIL_NOT_CONFIGURED) ? outcome : null;
}

/** How a survey's timeline entry describes what happened to its email. */
export function emailOutcomeNote(outcome: EmailOutcome): string {
  switch (outcome.status) {
    case "SENT":
      return "emailed";
    case "FAILED":
      return `email failed (${outcome.reason})`;
    case "SKIPPED":
      return `not emailed (${outcome.reason})`;
  }
}
