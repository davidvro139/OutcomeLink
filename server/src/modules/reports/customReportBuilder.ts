import type { Request, Response } from "express";
import {
  ENROLLMENT_STATUSES,
  EMPLOYMENT_STATUSES,
  REPORT_BUILDER_MAX_PERIODS,
  REPORT_BUILDER_PREVIEW_LIMIT,
  REPORT_ENTITY_TYPES,
  REPORT_FIELDS_BY_ENTITY,
  REPORT_FILTERS_BY_ENTITY,
  REPORT_PERIOD_LABEL_FIELD_KEY,
  REPORT_PERIOD_LABEL_HEADER,
  type ReportEntityType,
} from "@outcomelink/shared";
import { z } from "zod";
import { getAccessibleProgramIds } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import type { AccessTokenPayload } from "../../lib/jwt";
import { prisma } from "../../lib/prisma";
import { sendXlsx, type XlsxSheet } from "../../lib/xlsx";

/**
 * Custom Report Builder (Phase 3, spec §64). A curated, structured query
 * builder rather than a generic SQL/query-string interface: the field and
 * filter registries (shared/src/reportBuilder.ts) are the only vocabulary
 * this accepts, so there's no way to reference a column or table that isn't
 * explicitly wired up here — safe by construction, not by sanitization.
 *
 * Filters that the database can push down (program/campus/enrollment status,
 * employer industry/state/active, program campus/credential/licensure) are
 * applied as Prisma `where` clauses. employmentStatus can't be — it depends
 * on a reporting-period-scoped StudentOutcomeRecord join with at most one row
 * per enrollment per period, which is simpler to filter in application code
 * after flattening than to express correctly as a `where` clause. Because of
 * that, every fetch function returns its FULL filtered row set (no database
 * LIMIT) and only the caller (preview vs. export) decides how much of it to
 * actually send back — capping at the database layer here would make
 * totalCount and the JS-side employmentStatus filter disagree with each
 * other.
 *
 * Multiple reporting periods can be compared in one report ("see trends or
 * patterns" across past years): each period-aware fetcher runs once per
 * selected period and the results are concatenated, one row per entity per
 * period, with a `reportingPeriodLabel` column auto-prepended whenever 2+
 * periods are involved so rows stay distinguishable regardless of which
 * fields the user actually picked.
 */

const filterInputSchema = z.object({
  field: z.string(),
  value: z.unknown(),
});

export const runReportSchema = z.object({
  entityType: z.enum(REPORT_ENTITY_TYPES),
  fields: z.array(z.string()).min(1).max(50),
  filters: z.array(filterInputSchema).max(20).default([]),
  reportingPeriodIds: z.array(z.coerce.number().int().positive()).max(REPORT_BUILDER_MAX_PERIODS).optional(),
});
export type RunReportInput = z.infer<typeof runReportSchema>;

type Row = Record<string, unknown>;

interface ResolvedPeriod {
  id: number;
  label: string;
  startDate: Date;
  endDate: Date;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

function filterValue<T>(input: RunReportInput, field: string): T | undefined {
  return input.filters.find((f) => f.field === field)?.value as T | undefined;
}

/**
 * Validate filter values against their definitions. Checks:
 * - Value type matches filter definition (array vs. scalar)
 * - Element types match (string[], number[], boolean)
 * - No duplicate filters for the same field
 * - Enum-valued filters use only valid values
 * - ID-valued filters reference existing records
 * - Filter dependencies (e.g., requiresReportingPeriod) are satisfied
 */
async function validateFilters(
  input: RunReportInput,
  filterDefs: Map<string, typeof REPORT_FILTERS_BY_ENTITY[ReportEntityType][0]>,
  institutionId: number,
  hasPeriod: boolean,
) {
  const seenFields = new Set<string>();

  // Enum values for string-type filters
  const validEnumValues: Record<string, Set<string>> = {
    enrollmentStatus: new Set(ENROLLMENT_STATUSES),
    employmentStatus: new Set(EMPLOYMENT_STATUSES),
    // Additional enums can be added here as needed
  };

  for (const filter of input.filters) {
    const def = filterDefs.get(filter.field);
    if (!def) throw ApiError.badRequest(`Unknown filter field "${filter.field}" for ${input.entityType}`);

    // Check for duplicates
    if (seenFields.has(filter.field)) {
      throw ApiError.badRequest(`Duplicate filter for field "${filter.field}"`);
    }
    seenFields.add(filter.field);

    // Check requirements
    if (def.requiresReportingPeriod && !hasPeriod) {
      throw ApiError.badRequest(`Filter "${def.label}" requires at least one reporting period`);
    }

    // Validate value type matches definition
    const isArray = Array.isArray(filter.value);
    const expectedArray = def.operator === "in";
    if (isArray !== expectedArray) {
      const got = isArray ? "array" : "scalar";
      const expected = expectedArray ? "array" : "scalar";
      throw ApiError.badRequest(
        `Filter "${def.label}" expects ${expected} value, got ${got}`,
      );
    }

    // Validate element types
    const valuesToCheck: (string | number | boolean)[] = isArray ? (filter.value as (string | number | boolean)[]) : [filter.value as string | number | boolean];
    for (const val of valuesToCheck) {
      const actual = typeof val;
      if (actual !== def.valueType) {
        throw ApiError.badRequest(
          `Filter "${def.label}" expects ${def.valueType}[] values, got ${actual}`,
        );
      }
    }

    // Validate enum-constrained string values
    if (def.valueType === "string" && validEnumValues[filter.field]) {
      const validValues = validEnumValues[filter.field]!;
      const invalidValues = (filter.value as string[]).filter((v) => !validValues.has(v));
      if (invalidValues.length > 0) {
        throw ApiError.badRequest(
          `Filter "${def.label}": invalid value(s) "${invalidValues.join('", "')}" — valid options are ${[...validValues].join(", ")}`,
        );
      }
    }

    // Validate ID-constrained number values (programId, campusId)
    if (def.valueType === "number" && filter.field === "programId") {
      const ids = filter.value as number[];
      const existing = await prisma.program.findMany({
        where: { id: { in: ids }, institutionId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((p) => p.id));
      const invalid = ids.filter((id) => !existingIds.has(id));
      if (invalid.length > 0) {
        throw ApiError.badRequest(`Unknown program ID(s): ${invalid.join(", ")}`);
      }
    }

    if (def.valueType === "number" && filter.field === "campusId") {
      const ids = filter.value as number[];
      const existing = await prisma.campus.findMany({
        where: { id: { in: ids }, institutionId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((c) => c.id));
      const invalid = ids.filter((id) => !existingIds.has(id));
      if (invalid.length > 0) {
        throw ApiError.badRequest(`Unknown campus ID(s): ${invalid.join(", ")}`);
      }
    }
  }
}

function validateDefinition(input: RunReportInput) {
  const fieldDefs = REPORT_FIELDS_BY_ENTITY[input.entityType];
  const validFieldKeys = new Set(fieldDefs.map((f) => f.key));
  const unknownFields = input.fields.filter((f) => !validFieldKeys.has(f));
  if (unknownFields.length > 0) {
    throw ApiError.badRequest(`Unknown field(s) for ${input.entityType}: ${unknownFields.join(", ")}`);
  }

  const hasPeriod = (input.reportingPeriodIds?.length ?? 0) > 0;

  const filterDefs = new Map(REPORT_FILTERS_BY_ENTITY[input.entityType].map((f) => [f.key, f]));
  for (const filter of input.filters) {
    const def = filterDefs.get(filter.field);
    if (!def) throw ApiError.badRequest(`Unknown filter field "${filter.field}" for ${input.entityType}`);
    if (def.requiresReportingPeriod && !hasPeriod) {
      throw ApiError.badRequest(`Filter "${filter.field}" requires at least one reporting period`);
    }
  }

  const needsPeriod = input.fields.some(
    (f) => fieldDefs.find((d) => d.key === f)?.requiresReportingPeriod,
  );
  if (needsPeriod && !hasPeriod) {
    throw ApiError.badRequest("Selected fields require at least one reporting period");
  }
}

async function resolvePeriods(institutionId: number, input: RunReportInput): Promise<ResolvedPeriod[]> {
  const ids = input.reportingPeriodIds ?? [];
  if (ids.length === 0) return [];

  const periods = await prisma.reportingPeriod.findMany({ where: { id: { in: ids }, institutionId } });
  const foundIds = new Set(periods.map((p) => p.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw ApiError.badRequest(`Unknown reportingPeriodId(s): ${missing.join(", ")}`);
  }
  // Preserve the caller's requested order rather than the DB's arbitrary one.
  const byId = new Map(periods.map((p) => [p.id, p]));
  return ids.map((id) => {
    const p = byId.get(id)!;
    return { id: p.id, label: p.label, startDate: p.startDate, endDate: p.endDate };
  });
}

/**
 * Combines a user-selected `programId` filter with a program-scoped
 * caller's accessible set into the single set actually queryable — never
 * two separate `programId` conditions (Prisma `where` keys can't repeat; a
 * second one would silently replace the first rather than combine with it).
 * A scoped caller filtering to a program outside their own assignment
 * correctly gets zero rows (`in: []`), not an error and not the unfiltered
 * accessible set.
 */
function effectiveProgramIdFilter(
  requested: number[] | undefined,
  accessibleProgramIds: number[] | null,
): number[] | undefined {
  if (!accessibleProgramIds) return requested && requested.length > 0 ? requested : undefined;
  if (!requested || requested.length === 0) return accessibleProgramIds;
  return requested.filter((id) => accessibleProgramIds.includes(id));
}

async function fetchStudentRows(
  institutionId: number,
  input: RunReportInput,
  periods: ResolvedPeriod[],
  accessibleProgramIds: number[] | null,
): Promise<Row[]> {
  const programIds = effectiveProgramIdFilter(filterValue<number[]>(input, "programId"), accessibleProgramIds);
  const campusIds = filterValue<number[]>(input, "campusId");
  const enrollmentStatuses = filterValue<string[]>(input, "enrollmentStatus");
  const employmentStatuses = filterValue<string[]>(input, "employmentStatus");

  const baseWhere = {
    student: { institutionId },
    ...(programIds ? { programId: { in: programIds } } : {}),
    ...(campusIds && campusIds.length > 0 ? { campusId: { in: campusIds } } : {}),
    ...(enrollmentStatuses && enrollmentStatuses.length > 0
      ? { enrollmentStatus: { in: enrollmentStatuses as never[] } }
      : {}),
  };

  // A `null` context means "no period selected" — one pass, no outcome join.
  const contexts: (ResolvedPeriod | null)[] = periods.length > 0 ? periods : [null];
  const labelRows = periods.length > 1;

  const rows: Row[] = [];
  for (const period of contexts) {
    const enrollments = await prisma.studentEnrollment.findMany({
      where: baseWhere,
      include: {
        student: true,
        program: { select: { name: true } },
        campus: { select: { name: true } },
        // A conditional `include` (object vs. `false`) makes Prisma infer a
        // union type that loses the nested `employer` relation entirely —
        // kept the shape static, using a reportingPeriodId that can never
        // match a real row (0) for the no-period pass, so "no period
        // selected" and "no outcome record for this period" behave
        // identically (an empty outcomeRecords array).
        outcomeRecords: {
          where: { reportingPeriodId: period?.id ?? 0 },
          include: { employer: { select: { name: true } } },
        },
      },
      orderBy: { id: "asc" },
    });

    let periodRows: Row[] = enrollments.map((e) => {
      const outcome = e.outcomeRecords[0];
      const row: Row = {
        internalStudentId: e.student.internalStudentId,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        email: e.student.email,
        phone: e.student.phone,
        programName: e.program.name,
        campusName: e.campus.name,
        enrollmentStatus: e.enrollmentStatus,
        startDate: e.startDate,
        actualCompletionDate: e.actualCompletionDate,
        enrollmentObjective: e.enrollmentObjective,
        credentialEarned: e.credentialEarned,
        employmentStatus: outcome?.employmentStatus ?? null,
        employerName: outcome?.employer?.name ?? null,
        jobTitle: outcome?.jobTitle ?? null,
        relatedToTraining: outcome?.relatedToTraining ?? null,
        verificationStatus: outcome?.verificationStatus ?? null,
      };
      if (labelRows) row[REPORT_PERIOD_LABEL_FIELD_KEY] = period!.label;
      return row;
    });

    if (employmentStatuses && employmentStatuses.length > 0) {
      periodRows = periodRows.filter((r) => employmentStatuses.includes(r.employmentStatus as string));
    }
    rows.push(...periodRows);
  }

  return rows;
}

async function fetchEmployerRows(
  institutionId: number,
  input: RunReportInput,
  periods: ResolvedPeriod[],
  _accessibleProgramIds: number[] | null,
): Promise<Row[]> {
  // Employers aren't program-scoped (see search.ts's identical reasoning):
  // an employer can hire from several programs, so there's no single
  // program to check a scoped caller's access against.
  const industries = filterValue<string[]>(input, "industry");
  const states = filterValue<string[]>(input, "state");
  const activeFilter = filterValue<boolean>(input, "active");

  const employers = await prisma.employer.findMany({
    where: {
      institutionId,
      ...(industries && industries.length > 0 ? { industry: { in: industries } } : {}),
      ...(states && states.length > 0 ? { state: { in: states } } : {}),
      ...(activeFilter !== undefined ? { active: activeFilter } : {}),
    },
    orderBy: { name: "asc" },
  });
  const employerIds = employers.map((e) => e.id);

  const contexts: (ResolvedPeriod | null)[] = periods.length > 0 ? periods : [null];
  const labelRows = periods.length > 1;

  const rows: Row[] = [];
  for (const period of contexts) {
    // Scoped to placements starting within the period's date range (the same
    // attribution placementQuality() in reports.ts already uses, since
    // EmploymentRecord has no reportingPeriodId of its own) — or every
    // record, all-time, when no period was selected.
    const employersWithRecords = await prisma.employer.findMany({
      where: { id: { in: employerIds } },
      include: {
        employmentRecords: {
          where: period ? { startDate: { gte: period.startDate, lte: period.endDate } } : {},
          select: { fullTime: true, salaryOrWage: true },
        },
      },
    });
    const byId = new Map(employersWithRecords.map((e) => [e.id, e]));

    for (const employer of employers) {
      const e = byId.get(employer.id)!;
      const wages = e.employmentRecords
        .map((r) => (r.salaryOrWage !== null ? Number(r.salaryOrWage) : null))
        .filter((w): w is number => w !== null);
      const fullTimeCount = e.employmentRecords.filter((r) => r.fullTime).length;
      const row: Row = {
        name: e.name,
        industry: e.industry,
        city: e.city,
        state: e.state,
        active: e.active,
        placementCount: e.employmentRecords.length,
        averageWage: average(wages),
        fullTimeRate:
          e.employmentRecords.length > 0
            ? Math.round((fullTimeCount / e.employmentRecords.length) * 10000) / 100
            : null,
      };
      if (labelRows) row[REPORT_PERIOD_LABEL_FIELD_KEY] = period!.label;
      rows.push(row);
    }
  }

  return rows;
}

async function fetchProgramRows(
  institutionId: number,
  input: RunReportInput,
  periods: ResolvedPeriod[],
  accessibleProgramIds: number[] | null,
): Promise<Row[]> {
  const campusIds = filterValue<number[]>(input, "campusId");
  const credentialTypes = filterValue<string[]>(input, "credentialType");
  const licensureRequiredFilter = filterValue<boolean>(input, "licensureRequired");

  const programs = await prisma.program.findMany({
    where: {
      institutionId,
      ...(campusIds && campusIds.length > 0 ? { campusId: { in: campusIds } } : {}),
      ...(credentialTypes && credentialTypes.length > 0 ? { credentialType: { in: credentialTypes } } : {}),
      ...(licensureRequiredFilter !== undefined ? { licensureRequired: licensureRequiredFilter } : {}),
      ...(accessibleProgramIds && { id: { in: accessibleProgramIds } }),
    },
    include: { campus: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const contexts: (ResolvedPeriod | null)[] = periods.length > 0 ? periods : [null];
  const labelRows = periods.length > 1;

  const rows: Row[] = [];
  for (const period of contexts) {
    const cplByProgram = new Map<number, Partial<Record<"COMPLETION" | "PLACEMENT" | "LICENSURE", number>>>();
    if (period) {
      const results = await prisma.cplCalculationResult.findMany({
        where: { reportingPeriodId: period.id, programId: { in: programs.map((p) => p.id) } },
      });
      for (const r of results) {
        if (!r.programId) continue;
        const entry = cplByProgram.get(r.programId) ?? {};
        entry[r.metric] = Number(r.percentage);
        cplByProgram.set(r.programId, entry);
      }
    }

    for (const p of programs) {
      const cpl = cplByProgram.get(p.id) ?? {};
      const row: Row = {
        name: p.name,
        code: p.code,
        credentialType: p.credentialType,
        campusName: p.campus.name,
        licensureRequired: p.licensureRequired,
        active: p.active,
        completionPercentage: cpl.COMPLETION ?? null,
        placementPercentage: cpl.PLACEMENT ?? null,
        licensurePercentage: cpl.LICENSURE ?? null,
      };
      if (labelRows) row[REPORT_PERIOD_LABEL_FIELD_KEY] = period!.label;
      rows.push(row);
    }
  }

  return rows;
}

const FETCHERS: Record<
  ReportEntityType,
  (
    institutionId: number,
    input: RunReportInput,
    periods: ResolvedPeriod[],
    accessibleProgramIds: number[] | null,
  ) => Promise<Row[]>
> = {
  STUDENT: fetchStudentRows,
  EMPLOYER: fetchEmployerRows,
  PROGRAM: fetchProgramRows,
};

function pickFields(row: Row, fields: string[], includePeriodLabel: boolean): Row {
  const picked: Row = {};
  if (includePeriodLabel) picked[REPORT_PERIOD_LABEL_FIELD_KEY] = row[REPORT_PERIOD_LABEL_FIELD_KEY] ?? null;
  for (const f of fields) picked[f] = row[f] ?? null;
  return picked;
}

async function runQuery(
  user: AccessTokenPayload,
  input: RunReportInput,
): Promise<{ rows: Row[]; comparingPeriods: boolean; periods: ResolvedPeriod[] }> {
  validateDefinition(input);
  const institutionId = user.institutionId;
  const [periods, accessibleProgramIds] = await Promise.all([
    resolvePeriods(institutionId, input),
    getAccessibleProgramIds(user),
  ]);

  const hasPeriod = periods.length > 0;
  const filterDefs = new Map(REPORT_FILTERS_BY_ENTITY[input.entityType].map((f) => [f.key, f]));
  await validateFilters(input, filterDefs, institutionId, hasPeriod);

  const comparingPeriods = periods.length > 1;
  const allRows = await FETCHERS[input.entityType](institutionId, input, periods, accessibleProgramIds);
  return { rows: allRows.map((row) => pickFields(row, input.fields, comparingPeriods)), comparingPeriods, periods };
}

export async function runCustomReport(
  req: Request<Record<string, never>, unknown, RunReportInput>,
  res: Response,
) {
  const { rows } = await runQuery(req.user!, req.body);
  sendData(res, {
    rows: rows.slice(0, REPORT_BUILDER_PREVIEW_LIMIT),
    totalCount: rows.length,
    truncated: rows.length > REPORT_BUILDER_PREVIEW_LIMIT,
  });
}

/**
 * Runs a saved-or-ad-hoc report definition and shapes the result as
 * an `XlsxSheet` array with data and provenance — shared by the HTTP
 * export endpoint, job exports, and the Scheduled Reports subscription
 * runner (Phase 3, docs/TODO.md), which re-executes a
 * `SavedReport.definition` on a schedule.
 */
export async function buildCustomReportSheet(
  user: AccessTokenPayload,
  input: RunReportInput,
): Promise<{ sheets: XlsxSheet[]; rowCount: number }> {
  const { rows, comparingPeriods, periods } = await runQuery(user, input);
  const fieldDefs = REPORT_FIELDS_BY_ENTITY[input.entityType];

  const columns = [
    ...(comparingPeriods
      ? [{ header: REPORT_PERIOD_LABEL_HEADER, key: REPORT_PERIOD_LABEL_FIELD_KEY, width: 20 }]
      : []),
    ...input.fields.map((key) => ({
      header: fieldDefs.find((d) => d.key === key)?.label ?? key,
      key,
      width: 22,
    })),
  ];

  const dataSheet: XlsxSheet = { name: "Report", columns, rows };
  const provenanceSheet = await buildProvenanceSheet(input, periods, user.institutionId);

  return { sheets: [dataSheet, provenanceSheet], rowCount: rows.length };
}

async function buildProvenanceSheet(
  input: RunReportInput,
  periods: ResolvedPeriod[],
  institutionId: number,
): Promise<XlsxSheet> {
  const filterDefs = new Map(REPORT_FILTERS_BY_ENTITY[input.entityType].map((f) => [f.key, f]));

  const rows: Record<string, string>[] = [
    { item: "Report Generated", value: new Date().toISOString() },
    { item: "Entity Type", value: input.entityType },
    { item: "Institution", value: String(institutionId) },
  ];

  if (periods.length > 0) {
    rows.push({
      item: "Reporting Periods",
      value: periods.map(p => `${p.label} (${p.startDate.toISOString().split('T')[0]} to ${p.endDate.toISOString().split('T')[0]})`).join("; "),
    });
  }

  if (input.fields.length > 0) {
    const fieldDefs = REPORT_FIELDS_BY_ENTITY[input.entityType];
    const fieldLabels = input.fields.map(key => {
      const field = fieldDefs.find(f => f.key === key);
      return field?.label || key;
    });
    rows.push({
      item: "Selected Fields",
      value: fieldLabels.join(", "),
    });
  }

  if (input.filters.length > 0) {
    const filterStrings = input.filters.map(filter => {
      const def = filterDefs.get(filter.field);
      const label = def?.label || filter.field;
      const valueStr = Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value);
      return `${label}: ${valueStr}`;
    });
    rows.push({
      item: "Applied Filters",
      value: filterStrings.join("; "),
    });
  }

  rows.push(
    { item: "Data Freshness", value: "Results reflect the most recent validation run for each reporting period" },
    { item: "Enrollment Attributes", value: "Multi-period reports show enrollment status and program as of the selected period start date" },
  );

  return {
    name: "Provenance",
    columns: [
      { header: "Item", key: "item", width: 32 },
      { header: "Details", key: "value", width: 64 },
    ],
    rows,
  };
}

export async function exportCustomReport(
  req: Request<Record<string, never>, unknown, RunReportInput>,
  res: Response,
) {
  const input = req.body;
  const { sheets } = await buildCustomReportSheet(req.user!, input);

  await sendXlsx(res, `custom-report-${input.entityType.toLowerCase()}.xlsx`, sheets);
}
