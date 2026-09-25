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

/**
 * How a field can drive the Report Builder's "Chart" panel (only shown when
 * 2+ periods are compared): "numeric-sum"/"numeric-average" fields can be
 * the charted metric — summed or averaged across whatever rows land in a
 * group, matching each field's own real-world semantics (Placement Count
 * sums; a percentage or rate averages) — and "categorical" fields can be the
 * grouping dimension for a category-frequency chart. A field with neither
 * (ids, names, free text, dates) is chart-inert as a *value* but any
 * selected field, chartable or not, can still be picked as the chart's
 * *label* dimension for a per-row comparison.
 */
export type ReportFieldChartKind = "numeric-sum" | "numeric-average" | "categorical";

export interface ReportFieldDef {
  key: string;
  label: string;
  group: string;
  /** True if this field is only meaningful when a reporting period is selected. */
  requiresReportingPeriod?: boolean;
  chartKind?: ReportFieldChartKind;
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
  { key: "programName", label: "Program", group: "Enrollment", chartKind: "categorical" },
  { key: "campusName", label: "Campus", group: "Enrollment", chartKind: "categorical" },
  { key: "enrollmentStatus", label: "Enrollment Status", group: "Enrollment", chartKind: "categorical" },
  { key: "startDate", label: "Start Date", group: "Enrollment" },
  { key: "actualCompletionDate", label: "Completion Date", group: "Enrollment" },
  { key: "enrollmentObjective", label: "Enrollment Objective", group: "Enrollment", chartKind: "categorical" },
  { key: "credentialEarned", label: "Credential Earned", group: "Enrollment", chartKind: "categorical" },
  { key: "employmentStatus", label: "Employment Status", group: "Outcome", requiresReportingPeriod: true, chartKind: "categorical" },
  { key: "employerName", label: "Employer", group: "Outcome", requiresReportingPeriod: true, chartKind: "categorical" },
  { key: "jobTitle", label: "Job Title", group: "Outcome", requiresReportingPeriod: true },
  { key: "relatedToTraining", label: "Related to Training", group: "Outcome", requiresReportingPeriod: true, chartKind: "categorical" },
  { key: "verificationStatus", label: "Verification Status", group: "Outcome", requiresReportingPeriod: true, chartKind: "categorical" },
];

export const STUDENT_REPORT_FILTERS: ReportFilterDef[] = [
  { key: "programId", label: "Program", operator: "in", valueType: "number" },
  { key: "campusId", label: "Campus", operator: "in", valueType: "number" },
  { key: "enrollmentStatus", label: "Enrollment Status", operator: "in", valueType: "string" },
  { key: "employmentStatus", label: "Employment Status", operator: "in", valueType: "string", requiresReportingPeriod: true },
];

export const EMPLOYER_REPORT_FIELDS: ReportFieldDef[] = [
  { key: "name", label: "Name", group: "Employer" },
  { key: "industry", label: "Industry", group: "Employer", chartKind: "categorical" },
  { key: "city", label: "City", group: "Employer" },
  { key: "state", label: "State", group: "Employer", chartKind: "categorical" },
  { key: "active", label: "Active", group: "Employer", chartKind: "categorical" },
  // Not requiresReportingPeriod — these fall back to an all-time aggregate
  // with no period selected, same as before this field set became
  // period-aware, but scope to that period's placement start-date range
  // (the same attribution placementQuality() in reports.ts already uses,
  // since EmploymentRecord has no reportingPeriodId of its own) once one or
  // more periods are selected, one output row per period.
  { key: "placementCount", label: "Placement Count", group: "Outcomes", chartKind: "numeric-sum" },
  { key: "averageWage", label: "Average Wage", group: "Outcomes", chartKind: "numeric-average" },
  { key: "fullTimeRate", label: "Full-Time Rate", group: "Outcomes", chartKind: "numeric-average" },
];

export const EMPLOYER_REPORT_FILTERS: ReportFilterDef[] = [
  { key: "industry", label: "Industry", operator: "in", valueType: "string" },
  { key: "state", label: "State", operator: "in", valueType: "string" },
  { key: "active", label: "Active", operator: "eq", valueType: "boolean" },
];

export const PROGRAM_REPORT_FIELDS: ReportFieldDef[] = [
  { key: "name", label: "Name", group: "Program" },
  { key: "code", label: "Code", group: "Program" },
  { key: "credentialType", label: "Credential Type", group: "Program", chartKind: "categorical" },
  { key: "campusName", label: "Campus", group: "Program", chartKind: "categorical" },
  { key: "licensureRequired", label: "Licensure Required", group: "Program", chartKind: "categorical" },
  { key: "active", label: "Active", group: "Program", chartKind: "categorical" },
  { key: "completionPercentage", label: "Completion %", group: "CPL Results", requiresReportingPeriod: true, chartKind: "numeric-average" },
  { key: "placementPercentage", label: "Placement %", group: "CPL Results", requiresReportingPeriod: true, chartKind: "numeric-average" },
  { key: "licensurePercentage", label: "Licensure %", group: "CPL Results", requiresReportingPeriod: true, chartKind: "numeric-average" },
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
  /**
   * Zero or more reporting periods. With 2+, the query runs once per period
   * and results are concatenated — one row per entity per period — so
   * period-aware fields (or period-optional ones like Employer's placement
   * stats) can be compared year-over-year in a single table/export. When 2+
   * periods are selected, the server always prepends a `reportingPeriodLabel`
   * column (see REPORT_PERIOD_LABEL_FIELD_KEY) so rows stay distinguishable,
   * regardless of which fields were explicitly picked.
   */
  reportingPeriodIds?: number[];
}

/** Server response row cap for on-screen preview — export has no cap. */
export const REPORT_BUILDER_PREVIEW_LIMIT = 500;

<<<<<<< HEAD
=======
/**
 * Report pagination and bounded exports (docs/TODO.md): above this many
 * rows, "Export to Excel" queues a background export job instead of
 * generating and downloading synchronously in the original request — a
 * report this size risks tying up a request thread and hitting a client/
 * proxy timeout. Below it, export behaves exactly as before.
 */
export const REPORT_BUILDER_SYNC_EXPORT_THRESHOLD = 5000;

>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
/** Max number of reporting periods that can be compared in one report. */
export const REPORT_BUILDER_MAX_PERIODS = 10;

/**
 * Auto-injected (not user-selectable, never appears in a *_REPORT_FIELDS
 * registry) whenever 2+ reporting periods are compared, so multi-period rows
 * stay distinguishable no matter which real fields were picked.
 */
export const REPORT_PERIOD_LABEL_FIELD_KEY = "reportingPeriodLabel";
export const REPORT_PERIOD_LABEL_HEADER = "Reporting Period";
