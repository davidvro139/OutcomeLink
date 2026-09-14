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
