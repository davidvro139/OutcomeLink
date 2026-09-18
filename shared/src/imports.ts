/**
 * Bulk import (Phase 2 P12, extended for real SIS-export ingestion per spec
 * §51's "CSV, Excel, and SIS exports"). Student fields were the original,
 * narrower scope; enrollment fields were added later so a recurring export
 * (e.g. each term's roster from the institution's SIS — Northstar today,
 * migrating to OneWorld) can also create the term's enrollments, not just
 * touch student demographics.
 *
 * Enrollment fields are optional AS A GROUP: a mapping that doesn't touch any
 * of them behaves exactly like the original student-only import. Mapping ANY
 * one of them means this batch also creates one StudentEnrollment per row, at
 * which point the whole IMPORT_REQUIRED_ENROLLMENT_TARGET_FIELDS subset
 * becomes required together (see setMapping's validation in
 * server/src/modules/imports/importBatches.ts).
 */
export const IMPORT_STUDENT_TARGET_FIELDS = [
  "internalStudentId",
  "firstName",
  "lastName",
  "preferredName",
  "email",
  "phone",
] as const;

/**
 * Deliberately excludes campus: an enrollment's campus is derived from its
 * resolved Program's own campusId rather than mapped separately, since a
 * program belongs to exactly one campus already — asking the source file for
 * a second, independently-typed campus column would just be one more way for
 * the file and the database to disagree about a fact the database already
 * knows. Also excludes cohort/exitReason/allowableSubtractionReason — real
 * but comparatively rare fields, left as an existing-UI-only edit (same
 * scope-boundary reasoning P8/P12 already document elsewhere) rather than
 * every possible StudentEnrollment column having a generic-import path.
 */
export const IMPORT_ENROLLMENT_TARGET_FIELDS = [
  "programCode",
  "startDate",
  "enrollmentStatus",
  "expectedCompletionDate",
  "actualCompletionDate",
  "credentialEarned",
  "enrollmentObjective",
] as const;

export const IMPORT_TARGET_FIELDS = [
  ...IMPORT_STUDENT_TARGET_FIELDS,
  ...IMPORT_ENROLLMENT_TARGET_FIELDS,
] as const;
export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

export const IMPORT_REQUIRED_TARGET_FIELDS: readonly ImportTargetField[] = [
  "internalStudentId",
  "firstName",
  "lastName",
];

/** Required together only once ANY enrollment field is mapped — see the module doc comment above. */
export const IMPORT_REQUIRED_ENROLLMENT_TARGET_FIELDS: readonly ImportTargetField[] = [
  "programCode",
  "startDate",
  "enrollmentStatus",
];

export const IMPORT_TARGET_FIELD_LABELS: Record<ImportTargetField, string> = {
  internalStudentId: "Internal Student ID",
  firstName: "First Name",
  lastName: "Last Name",
  preferredName: "Preferred Name",
  email: "Email",
  phone: "Phone",
  programCode: "Program Code",
  startDate: "Enrollment Start Date",
  enrollmentStatus: "Enrollment Status",
  expectedCompletionDate: "Expected Completion Date",
  actualCompletionDate: "Actual Completion Date",
  credentialEarned: "Credential Earned",
  enrollmentObjective: "Enrollment Objective",
};

/** Source file column name -> target field, per docs/DATA_MODEL.md §11. */
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

/** Single source of truth for both the upload picker's `accept` and the server's extension check. */
export const IMPORT_ACCEPTED_FILE_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;
