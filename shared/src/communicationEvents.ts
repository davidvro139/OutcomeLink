/**
 * Unified Student Communication Timeline (Phase 2 P13, docs/TODO.md;
 * docs/DATA_MODEL.md §8's CommunicationEvent). Split by survey type rather
 * than a single SURVEY_SENT/SURVEY_RESPONSE pair — sourceId alone can't
 * disambiguate which table it points into, since GraduateSurvey and
 * EmployerSurvey (and their Response tables) are separate auto-incrementing
 * primary keys.
 */
export const COMMUNICATION_EVENT_TYPES = [
  "FOLLOW_UP_ATTEMPT",
  "GRADUATE_SURVEY_SENT",
  "GRADUATE_SURVEY_RESPONSE",
  "EMPLOYER_SURVEY_SENT",
  "EMPLOYER_SURVEY_RESPONSE",
  "VERIFICATION_CONTACT",
  "NOTIFICATION",
] as const;
export type CommunicationEventType = (typeof COMMUNICATION_EVENT_TYPES)[number];

export const COMMUNICATION_EVENT_TYPE_LABELS: Record<CommunicationEventType, string> = {
  FOLLOW_UP_ATTEMPT: "Follow-Up Attempt",
  GRADUATE_SURVEY_SENT: "Graduate Survey Sent",
  GRADUATE_SURVEY_RESPONSE: "Graduate Survey Response",
  EMPLOYER_SURVEY_SENT: "Employer Survey Sent",
  EMPLOYER_SURVEY_RESPONSE: "Employer Survey Response",
  VERIFICATION_CONTACT: "Verification Contact",
  NOTIFICATION: "Notification",
};
