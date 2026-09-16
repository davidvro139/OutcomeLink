/**
 * Display-level enrollment status only (spec §6). Accreditation classification
 * is a separate, rule-engine-derived concept — see cplMetric.ts and the
 * accreditation module — and must never be inferred from this value.
 */
export const ENROLLMENT_STATUSES = [
  "ACTIVE",
  "GRADUATE_COMPLETER",
  "NON_GRADUATE_COMPLETER",
  "WITHDRAWN",
  "TRANSFERRED",
  "OTHER",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ACTIVE: "Active",
  GRADUATE_COMPLETER: "Graduate Completer",
  NON_GRADUATE_COMPLETER: "Non-Graduate Completer",
  WITHDRAWN: "Withdrawn",
  TRANSFERRED: "Transferred",
  OTHER: "Other",
};

/**
 * COE's enrollment-stage "Allowable Subtraction" categories (docs/COE_RULE_MATRIX.md §2)
 * that apply to a WITHDRAWN enrollment specifically — each documents a reason the
 * withdrawal should be excluded from the completion rate entirely (neutral) rather
 * than counted as a negative Withdrawal. Only the categories meaningful to a
 * withdrawal are modeled here: "transferred to another program within the
 * institution" is already handled by the existing TRANSFERRED enrollment status
 * (never entering completion classification at all), and "secondary students" is
 * out of scope since this schema doesn't model secondary/high-school programs.
 */
export const ALLOWABLE_SUBTRACTION_REASONS = [
  "FULL_REFUND_OR_FIRST_DAY_ONLY",
  "DOCUMENTED_UNAVAILABLE",
  "MISSION_FOREIGN_AID_OR_MILITARY_ACTIVATION",
] as const;

export type AllowableSubtractionReason = (typeof ALLOWABLE_SUBTRACTION_REASONS)[number];

export const ALLOWABLE_SUBTRACTION_REASON_LABELS: Record<AllowableSubtractionReason, string> = {
  FULL_REFUND_OR_FIRST_DAY_ONLY: "Full tuition refund, or attended only the first day",
  DOCUMENTED_UNAVAILABLE:
    "Documented unavailability (pregnancy, serious health issue, caring for ill family member, incarceration, death)",
  MISSION_FOREIGN_AID_OR_MILITARY_ACTIVATION:
    "Official church mission, foreign-aid service, or military/National Guard activation",
};
