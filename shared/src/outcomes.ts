/**
 * Controlled vocabularies for the raw facts staff record on a StudentOutcomeRecord.
 * These feed the accreditation classifier (server/src/modules/accreditation/classifiers) —
 * see docs/COE_RULE_MATRIX.md. Staff record what happened; the classifier derives the
 * COE-specific bucket, per spec §3's "records -> classifications" pipeline.
 */
export const EMPLOYMENT_STATUSES = ["EMPLOYED", "UNEMPLOYED", "UNKNOWN"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const CONTINUING_EDUCATION_STATUSES = ["NOT_ENROLLED", "ENROLLED"] as const;
export type ContinuingEducationStatus = (typeof CONTINUING_EDUCATION_STATUSES)[number];

export const MILITARY_STATUSES = ["NONE", "ENTERED_MILITARY"] as const;
export type MilitaryStatus = (typeof MILITARY_STATUSES)[number];

/**
 * Matches docs/COE_RULE_MATRIX.md §4's "Unavailable"/"Refused" categories exactly —
 * these are documented, evidence-backed statuses, not casual free text.
 */
export const AVAILABILITY_STATUSES = [
  "AVAILABLE",
  "UNAVAILABLE_HEALTH_OR_FAMILY",
  "UNAVAILABLE_INCARCERATED",
  "UNAVAILABLE_DECEASED",
  "REFUSED_EMPLOYMENT",
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/**
 * Output of the Completion classifier — see docs/COE_RULE_MATRIX.md §3.
 * ALLOWABLE_SUBTRACTION covers a withdrawal for one of the documented
 * enrollment-stage "Allowable Subtraction" reasons (enrollment.ts) — excluded
 * from the completion rate entirely, distinct from an ordinary WITHDRAWAL
 * which counts against the institution.
 * NOT_REPORTABLE covers an enrollment whose objective isn't in scope for
 * accreditation reporting at all (e.g. a secondary/high-school student, or
 * one enrolled purely for personal enrichment) — see
 * StudentEnrollment.reportableForAccreditation in the Prisma schema.
 */
export const COMPLETION_CLASSIFICATIONS = [
  "GRADUATE_COMPLETER",
  "NON_GRADUATE_COMPLETER",
  "WITHDRAWAL",
  "ALLOWABLE_SUBTRACTION",
  "NOT_REPORTABLE",
  "NOT_APPLICABLE",
] as const;
export type CompletionClassification = (typeof COMPLETION_CLASSIFICATIONS)[number];

/** Output of the Placement classifier — the six mutually exclusive COE categories, docs/COE_RULE_MATRIX.md §4. */
export const PLACEMENT_CLASSIFICATIONS = [
  "EMPLOYED_RELATED",
  "EMPLOYED_UNRELATED",
  "AWAITING_LICENSURE",
  "UNAVAILABLE",
  "REFUSED",
  "SEEKING_OR_UNKNOWN",
  "NOT_APPLICABLE",
] as const;
export type PlacementClassification = (typeof PLACEMENT_CLASSIFICATIONS)[number];

/** Output of the Licensure classifier — docs/COE_RULE_MATRIX.md §5. */
export const LICENSURE_CLASSIFICATIONS = ["PASSED", "FAILED", "AWAITING", "NOT_APPLICABLE"] as const;
export type LicensureClassification = (typeof LICENSURE_CLASSIFICATIONS)[number];

/**
 * Who determined that a student's employment is (or isn't) related to their
 * field of instruction — staff self-report vs. an instructor's expert
 * determination carry different evidentiary weight, per an institution's own
 * outcomes-training material (docs/Outcomes and CPL slides.pdf). Purely a
 * provenance/evidence field; it does not affect classification.
 */
export const RELATED_TO_TRAINING_SOURCES = ["STUDENT_REPORTED", "INSTRUCTOR_REPORTED"] as const;
export type RelatedToTrainingSource = (typeof RELATED_TO_TRAINING_SOURCES)[number];
