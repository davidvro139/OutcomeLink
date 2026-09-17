/**
 * Controlled vocabularies for Graduate/Employer survey responses (spec §63
 * survey system; docs/DATA_MODEL.md §9). Survey responses are self-reported,
 * unverified data — they feed StudentOutcomeRecord/EmploymentRecord only
 * through an explicit staff review step (spec §43), never automatically, so
 * these vocabularies are kept separate from outcomes.ts's classifier-facing
 * ones even where the concepts overlap.
 */

export const RATING_VALUES = [1, 2, 3, 4, 5] as const;
export type RatingValue = (typeof RATING_VALUES)[number];

/** Whether the graduate believes their job is related to their program of study. */
export const GRADUATE_RELATED_TO_TRAINING_RESPONSES = ["YES", "NO", "UNSURE"] as const;
export type GraduateRelatedToTrainingResponse = (typeof GRADUATE_RELATED_TO_TRAINING_RESPONSES)[number];

/** Whether the employer confirms the graduate is actually employed there. */
export const EMPLOYER_VERIFICATION_RESPONSES = ["CONFIRMED", "NOT_CONFIRMED"] as const;
export type EmployerVerificationResponse = (typeof EMPLOYER_VERIFICATION_RESPONSES)[number];
