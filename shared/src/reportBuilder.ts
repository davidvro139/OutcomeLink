/**
 * Custom Report Builder (Phase 3, spec §64). A curated, structured query
 * builder rather than a generic SQL/query-string interface — safe by
 * construction (no injection surface) and scoped to what staff actually ask
 * for: pick an entity, pick columns, apply a handful of filters, run it,
 * export it, optionally save it for reuse. Field/filter registries are
 * shared so the frontend's pickers and the backend's query builder can never
 * drift apart about what a given key means.
 */

export const REPORT_ENTITY_TYPES = ["STUDENT", "EMPLOYER", "PROGRAM"] as const;
export type ReportEntityType = (typeof REPORT_ENTITY_TYPES)[number];

export const REPORT_ENTITY_LABELS: Record<ReportEntityType, string> = {
  STUDENT: "Students",
  EMPLOYER: "Employers",
  PROGRAM: "Programs",
};

export interface ReportFieldDef {
  key: string;
  label: string;
  group: string;
  /** True if this field is only meaningful when a reporting period is selected. */
  requiresReportingPeriod?: boolean;
}

export interface ReportFilterDef {
  key: string;
  label: string;
  /** "in" = value is an array (multi-select); "eq" = value is a single scalar. */
  operator: "in" | "eq";
  valueType: "number" | "string" | "boolean";
  requiresReportingPeriod?: boolean;
}

export const STUDENT_REPORT_FIELDS: ReportFieldDef[] = [
  { key: "internalStudentId", label: "Internal Student ID", group: "Student" },
  { key: "firstName", label: "First Name", group: "Student" },
  { key: "lastName", label: "Last Name", group: "Student" },
  { key: "email", label: "Email", group: "Student" },
  { key: "phone", label: "Phone", group: "Student" },
  { key: "programName", label: "Program", group: "Enrollment" },
  { key: "campusName", label: "Campus", group: "Enrollment" },
  { key: "enrollmentStatus", label: "Enrollment Status", group: "Enrollment" },
  { key: "startDate", label: "Start Date", group: "Enrollment" },
  { key: "actualCompletionDate", label: "Completion Date", group: "Enrollment" },
  { key: "enrollmentObjective", label: "Enrollment Objective", group: "Enrollment" },
  { key: "credentialEarned", label: "Credential Earned", group: "Enrollment" },
  { key: "employmentStatus", label: "Employment Status", group: "Outcome", requiresReportingPeriod: true },
  { key: "employerName", label: "Employer", group: "Outcome", requiresReportingPeriod: true },
  { key: "jobTitle", label: "Job Title", group: "Outcome", requiresReportingPeriod: true },
  { key: "relatedToTraining", label: "Related to Training", group: "Outcome", requiresReportingPeriod: true },
  { key: "verificationStatus", label: "Verification Status", group: "Outcome", requiresReportingPeriod: true },
];

export const STUDENT_REPORT_FILTERS: ReportFilterDef[] = [
  { key: "programId", label: "Program", operator: "in", valueType: "number" },
  { key: "campusId", label: "Campus", operator: "in", valueType: "number" },
  { key: "enrollmentStatus", label: "Enrollment Status", operator: "in", valueType: "string" },
  { key: "employmentStatus", label: "Employment Status", operator: "in", valueType: "string", requiresReportingPeriod: true },
];

export const EMPLOYER_REPORT_FIELDS: ReportFieldDef[] = [
  { key: "name", label: "Name", group: "Employer" },
  { key: "industry", label: "Industry", group: "Employer" },
  { key: "city", label: "City", group: "Employer" },
  { key: "state", label: "State", group: "Employer" },
  { key: "active", label: "Active", group: "Employer" },
  { key: "placementCount", label: "Placement Count (all-time)", group: "Outcomes" },
  { key: "averageWage", label: "Average Wage (all-time)", group: "Outcomes" },
  { key: "fullTimeRate", label: "Full-Time Rate (all-time)", group: "Outcomes" },
];

export const EMPLOYER_REPORT_FILTERS: ReportFilterDef[] = [
  { key: "industry", label: "Industry", operator: "in", valueType: "string" },
  { key: "state", label: "State", operator: "in", valueType: "string" },
  { key: "active", label: "Active", operator: "eq", valueType: "boolean" },
];

export const PROGRAM_REPORT_FIELDS: ReportFieldDef[] = [
  { key: "name", label: "Name", group: "Program" },
  { key: "code", label: "Code", group: "Program" },
  { key: "credentialType", label: "Credential Type", group: "Program" },
  { key: "campusName", label: "Campus", group: "Program" },
  { key: "licensureRequired", label: "Licensure Required", group: "Program" },
  { key: "active", label: "Active", group: "Program" },
  { key: "completionPercentage", label: "Completion %", group: "CPL Results", requiresReportingPeriod: true },
  { key: "placementPercentage", label: "Placement %", group: "CPL Results", requiresReportingPeriod: true },
  { key: "licensurePercentage", label: "Licensure %", group: "CPL Results", requiresReportingPeriod: true },
];

export const PROGRAM_REPORT_FILTERS: ReportFilterDef[] = [
  { key: "campusId", label: "Campus", operator: "in", valueType: "number" },
  { key: "credentialType", label: "Credential Type", operator: "in", valueType: "string" },
  { key: "licensureRequired", label: "Licensure Required", operator: "eq", valueType: "boolean" },
];

export const REPORT_FIELDS_BY_ENTITY: Record<ReportEntityType, ReportFieldDef[]> = {
  STUDENT: STUDENT_REPORT_FIELDS,
  EMPLOYER: EMPLOYER_REPORT_FIELDS,
  PROGRAM: PROGRAM_REPORT_FIELDS,
};

export const REPORT_FILTERS_BY_ENTITY: Record<ReportEntityType, ReportFilterDef[]> = {
  STUDENT: STUDENT_REPORT_FILTERS,
  EMPLOYER: EMPLOYER_REPORT_FILTERS,
  PROGRAM: PROGRAM_REPORT_FILTERS,
};

export interface ReportFilterInput {
  field: string;
  value: string[] | number[] | boolean;
}

export interface ReportDefinition {
  entityType: ReportEntityType;
  fields: string[];
  filters: ReportFilterInput[];
  reportingPeriodId?: number;
}

/** Server response row cap for on-screen preview — export has no cap. */
export const REPORT_BUILDER_PREVIEW_LIMIT = 500;
