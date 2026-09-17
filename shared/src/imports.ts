/**
 * Bulk student import (Phase 2 P12, docs/TODO.md). Scoped to the Student
 * model's own core fields — the same ones createStudentSchema accepts on the
 * server — rather than enrollments/outcomes, which have too many
 * institution-specific dependencies (program, campus, reporting period) to
 * map generically from an arbitrary source system's export.
 */
export const IMPORT_TARGET_FIELDS = [
  "internalStudentId",
  "firstName",
  "lastName",
  "preferredName",
  "email",
  "phone",
] as const;
export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

export const IMPORT_REQUIRED_TARGET_FIELDS: readonly ImportTargetField[] = [
  "internalStudentId",
  "firstName",
  "lastName",
];

export const IMPORT_TARGET_FIELD_LABELS: Record<ImportTargetField, string> = {
  internalStudentId: "Internal Student ID",
  firstName: "First Name",
  lastName: "Last Name",
  preferredName: "Preferred Name",
  email: "Email",
  phone: "Phone",
};

/** Source CSV column name -> target Student field, per docs/DATA_MODEL.md §11. */
export type ImportColumnMapping = Partial<Record<string, ImportTargetField>>;

export const IMPORT_BATCH_STATUSES = [
  "UPLOADED",
  "MAPPED",
  "VALIDATED",
  "PREVIEWED",
  "IMPORTED",
  "FAILED",
] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];
