export const EVIDENCE_TYPES = [
  "EMPLOYER_VERIFICATION",
  "GRADUATE_CONFIRMATION",
  "EMAIL",
  "LETTER",
  "SURVEY",
  "EMPLOYMENT_DOCUMENTATION",
  "LICENSURE_RESULT",
  "SCHOOL_RECORD",
  "OTHER",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const IMPROVEMENT_PLAN_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "MONITORING",
  "COMPLETED",
  "CLOSED",
] as const;
export type ImprovementPlanStatus = (typeof IMPROVEMENT_PLAN_STATUSES)[number];
