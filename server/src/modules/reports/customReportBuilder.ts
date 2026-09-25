import type { Request, Response } from "express";
import {
<<<<<<< HEAD
  REPORT_BUILDER_MAX_PERIODS,
  REPORT_BUILDER_PREVIEW_LIMIT,
=======
  ENROLLMENT_STATUSES,
  EMPLOYMENT_STATUSES,
  REPORT_BUILDER_MAX_PERIODS,
  REPORT_BUILDER_PREVIEW_LIMIT,
  REPORT_BUILDER_SYNC_EXPORT_THRESHOLD,
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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
<<<<<<< HEAD
=======
import {
  buildProvenanceSheet,
  describeGeneratedBy,
  describePeriods,
  formatTimestamp,
  type ProvenanceEntry,
} from "../../lib/provenance";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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
  value: z.union([z.array(z.string()), z.array(z.number()), z.boolean()]),
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

<<<<<<< HEAD
=======
/** Filter fields whose values must come from a fixed vocabulary, not free text. */
const FILTER_ENUM_VALUES: Record<string, readonly string[]> = {
  enrollmentStatus: ENROLLMENT_STATUSES,
  employmentStatus: EMPLOYMENT_STATUSES,
};

/** Filter fields holding database ids, and how to check each belongs to the caller's institution. */
const FILTER_ID_CHECKS: Record<string, (institutionId: number, ids: number[]) => Promise<number>> = {
  programId: (institutionId, ids) => prisma.program.count({ where: { id: { in: ids }, institutionId } }),
  campusId: (institutionId, ids) => prisma.campus.count({ where: { id: { in: ids }, institutionId } }),
};

/**
 * Value-level validation of each filter against its own definition
 * (docs/TODO.md's "validate report filters against their field definitions"):
 * runReportSchema only guarantees a value is *some* string[]/number[]/boolean,
 * so a mismatched type, an unknown enum value, or a foreign id used to either
 * blow up inside Prisma as a 500 or be silently dropped (an empty array was
 * skipped entirely, and a duplicate field let the last one win). Each is now
 * a clear 400. A same-institution id outside a scoped caller's access is
 * deliberately NOT rejected here — that still returns zero rows, per
 * effectiveProgramIdFilter — only ids that don't exist in the institution at all.
 */
async function validateFilterValues(institutionId: number, input: RunReportInput) {
  const defs = new Map(REPORT_FILTERS_BY_ENTITY[input.entityType].map((f) => [f.key, f]));
  const seen = new Set<string>();

  for (const filter of input.filters) {
    if (seen.has(filter.field)) throw ApiError.badRequest(`Filter "${filter.field}" was specified more than once`);
    seen.add(filter.field);

    const def = defs.get(filter.field)!; // existence already checked by validateDefinition
    const { value } = filter;
    const label = `Filter "${filter.field}"`;

    if (def.operator === "eq") {
      if (Array.isArray(value)) throw ApiError.badRequest(`${label} takes a single value, not a list`);
      if (typeof value !== def.valueType) throw ApiError.badRequest(`${label} must be a ${def.valueType}`);
      continue;
    }

    if (!Array.isArray(value)) throw ApiError.badRequest(`${label} must be a list of ${def.valueType}s`);
    if (value.length === 0) throw ApiError.badRequest(`${label} must include at least one value (omit the filter to not filter)`);
    if (value.length > 100) throw ApiError.badRequest(`${label} has too many values (max 100)`);
    if (!(value as unknown[]).every((v) => typeof v === def.valueType)) {
      throw ApiError.badRequest(`${label} values must all be ${def.valueType}s`);
    }

    if (def.valueType === "number") {
      const ids = value as number[];
      if (!ids.every((v) => Number.isInteger(v) && v > 0)) throw ApiError.badRequest(`${label} values must be positive integers`);
      const check = FILTER_ID_CHECKS[filter.field];
      if (check && (await check(institutionId, [...new Set(ids)])) !== new Set(ids).size) {
        throw ApiError.badRequest(`${label} references an unknown id`);
      }
    }

    if (def.valueType === "string") {
      const strings = value as string[];
      if (strings.some((v) => v.trim().length === 0 || v.length > 200)) {
        throw ApiError.badRequest(`${label} values must be non-empty strings up to 200 characters`);
      }
      const allowed = FILTER_ENUM_VALUES[filter.field];
      const invalid = allowed && strings.filter((v) => !allowed.includes(v));
      if (invalid && invalid.length > 0) {
        throw ApiError.badRequest(`${label} has unknown value(s): ${invalid.join(", ")}`);
      }
    }
  }
}

>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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

<<<<<<< HEAD
=======
interface FetchResult {
  rows: Row[];
  totalCount: number;
}

>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
async function fetchStudentRows(
  institutionId: number,
  input: RunReportInput,
  periods: ResolvedPeriod[],
  accessibleProgramIds: number[] | null,
<<<<<<< HEAD
): Promise<Row[]> {
=======
  // Ignored — STUDENT keeps its full-fetch-then-JS-filter behavior (see the
  // file-header comment on employmentStatus); only EMPLOYER/PROGRAM, which
  // have no such constraint, get real DB-level pagination. A deliberate,
  // documented exception, not an oversight.
  _limit?: number,
): Promise<FetchResult> {
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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

<<<<<<< HEAD
  return rows;
=======
  return { rows, totalCount: rows.length };
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}

async function fetchEmployerRows(
  institutionId: number,
  input: RunReportInput,
  periods: ResolvedPeriod[],
  _accessibleProgramIds: number[] | null,
<<<<<<< HEAD
): Promise<Row[]> {
=======
  limit?: number,
): Promise<FetchResult> {
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  // Employers aren't program-scoped (see search.ts's identical reasoning):
  // an employer can hire from several programs, so there's no single
  // program to check a scoped caller's access against.
  const industries = filterValue<string[]>(input, "industry");
  const states = filterValue<string[]>(input, "state");
  const activeFilter = filterValue<boolean>(input, "active");

<<<<<<< HEAD
  const employers = await prisma.employer.findMany({
    where: {
      institutionId,
      ...(industries && industries.length > 0 ? { industry: { in: industries } } : {}),
      ...(states && states.length > 0 ? { state: { in: states } } : {}),
      ...(activeFilter !== undefined ? { active: activeFilter } : {}),
    },
    orderBy: { name: "asc" },
  });
=======
  const where = {
    institutionId,
    ...(industries && industries.length > 0 ? { industry: { in: industries } } : {}),
    ...(states && states.length > 0 ? { state: { in: states } } : {}),
    ...(activeFilter !== undefined ? { active: activeFilter } : {}),
  };

  // A `limit` (preview mode only — export always fetches everything, per
  // this file's own header comment on why full materialization was chosen
  // originally) caps the base entity fetch instead of fetching every
  // matching employer just to throw most of them away, with an exact
  // count() alongside so totalCount never has to guess.
  const [employers, matchingCount] = await Promise.all([
    prisma.employer.findMany({ where, orderBy: { name: "asc" }, ...(limit !== undefined ? { take: limit } : {}) }),
    limit !== undefined ? prisma.employer.count({ where }) : Promise.resolve(undefined),
  ]);
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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

<<<<<<< HEAD
  return rows;
=======
  // Each matching employer produces one row per period, so the exact total
  // scales the same way the actual row set does — never an approximation.
  const totalCount = matchingCount !== undefined ? matchingCount * Math.max(contexts.length, 1) : rows.length;
  return { rows, totalCount };
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}

async function fetchProgramRows(
  institutionId: number,
  input: RunReportInput,
  periods: ResolvedPeriod[],
  accessibleProgramIds: number[] | null,
<<<<<<< HEAD
): Promise<Row[]> {
=======
  limit?: number,
): Promise<FetchResult> {
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  const campusIds = filterValue<number[]>(input, "campusId");
  const credentialTypes = filterValue<string[]>(input, "credentialType");
  const licensureRequiredFilter = filterValue<boolean>(input, "licensureRequired");

<<<<<<< HEAD
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
=======
  const where = {
    institutionId,
    ...(campusIds && campusIds.length > 0 ? { campusId: { in: campusIds } } : {}),
    ...(credentialTypes && credentialTypes.length > 0 ? { credentialType: { in: credentialTypes } } : {}),
    ...(licensureRequiredFilter !== undefined ? { licensureRequired: licensureRequiredFilter } : {}),
    ...(accessibleProgramIds && { id: { in: accessibleProgramIds } }),
  };

  // Same preview-mode capping as fetchEmployerRows above.
  const [programs, matchingCount] = await Promise.all([
    prisma.program.findMany({
      where,
      include: { campus: { select: { name: true } } },
      orderBy: { name: "asc" },
      ...(limit !== undefined ? { take: limit } : {}),
    }),
    limit !== undefined ? prisma.program.count({ where }) : Promise.resolve(undefined),
  ]);
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

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

<<<<<<< HEAD
  return rows;
=======
  const totalCount = matchingCount !== undefined ? matchingCount * Math.max(contexts.length, 1) : rows.length;
  return { rows, totalCount };
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}

const FETCHERS: Record<
  ReportEntityType,
  (
    institutionId: number,
    input: RunReportInput,
    periods: ResolvedPeriod[],
    accessibleProgramIds: number[] | null,
<<<<<<< HEAD
  ) => Promise<Row[]>
=======
    limit?: number,
  ) => Promise<FetchResult>
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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

<<<<<<< HEAD
async function runQuery(
  user: AccessTokenPayload,
  input: RunReportInput,
): Promise<{ rows: Row[]; comparingPeriods: boolean }> {
  validateDefinition(input);
  const institutionId = user.institutionId;
=======
/**
 * `limit` is preview-only (EMPLOYER/PROGRAM only — see fetchStudentRows'
 * comment): when set, the fetcher caps its base entity query at the DB layer
 * and returns an exact `totalCount` via count() instead of fetching every
 * matching row just to slice most of them away. Omitted entirely for export,
 * which still needs (and gets) the full set.
 */
async function runQuery(
  user: AccessTokenPayload,
  input: RunReportInput,
  limit?: number,
): Promise<{ rows: Row[]; totalCount: number; comparingPeriods: boolean; periods: ResolvedPeriod[] }> {
  validateDefinition(input);
  const institutionId = user.institutionId;
  await validateFilterValues(institutionId, input);
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  const [periods, accessibleProgramIds] = await Promise.all([
    resolvePeriods(institutionId, input),
    getAccessibleProgramIds(user),
  ]);
  const comparingPeriods = periods.length > 1;
<<<<<<< HEAD
  const allRows = await FETCHERS[input.entityType](institutionId, input, periods, accessibleProgramIds);
  return { rows: allRows.map((row) => pickFields(row, input.fields, comparingPeriods)), comparingPeriods };
=======
  const { rows: allRows, totalCount } = await FETCHERS[input.entityType](
    institutionId,
    input,
    periods,
    accessibleProgramIds,
    limit,
  );
  return {
    rows: allRows.map((row) => pickFields(row, input.fields, comparingPeriods)),
    totalCount,
    comparingPeriods,
    periods,
  };
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}

export async function runCustomReport(
  req: Request<Record<string, never>, unknown, RunReportInput>,
  res: Response,
) {
<<<<<<< HEAD
  const { rows } = await runQuery(req.user!, req.body);
  sendData(res, {
    rows: rows.slice(0, REPORT_BUILDER_PREVIEW_LIMIT),
    totalCount: rows.length,
    truncated: rows.length > REPORT_BUILDER_PREVIEW_LIMIT,
  });
}

/**
 * Runs a saved-or-ad-hoc report definition and shapes the result as an
 * `XlsxSheet` — shared by the HTTP export endpoint below and, without any
 * `req`/`res` in sight, the Scheduled Reports subscription runner (Phase 3,
 * docs/TODO.md), which re-executes a `SavedReport.definition` on a schedule.
 */
export async function buildCustomReportSheet(
  user: AccessTokenPayload,
  input: RunReportInput,
): Promise<XlsxSheet> {
  const { rows, comparingPeriods } = await runQuery(user, input);
  const fieldDefs = REPORT_FIELDS_BY_ENTITY[input.entityType];

  const columns = [
=======
  const { rows, totalCount } = await runQuery(req.user!, req.body, REPORT_BUILDER_PREVIEW_LIMIT);
  sendData(res, {
    // A no-op slice for EMPLOYER/PROGRAM (already capped at the DB layer);
    // still does the real work for STUDENT, which ignores `limit` and
    // returns its full filtered set here, same as before this change.
    rows: rows.slice(0, REPORT_BUILDER_PREVIEW_LIMIT),
    totalCount,
    truncated: totalCount > REPORT_BUILDER_PREVIEW_LIMIT,
  });
}

function buildReportColumns(input: RunReportInput, comparingPeriods: boolean) {
  const fieldDefs = REPORT_FIELDS_BY_ENTITY[input.entityType];
  return [
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
    ...(comparingPeriods
      ? [{ header: REPORT_PERIOD_LABEL_HEADER, key: REPORT_PERIOD_LABEL_FIELD_KEY, width: 20 }]
      : []),
    ...input.fields.map((key) => ({
      header: fieldDefs.find((d) => d.key === key)?.label ?? key,
      key,
      width: 22,
    })),
  ];
<<<<<<< HEAD

  return { name: "Report", columns, rows };
}

=======
}

/**
 * Runs a saved-or-ad-hoc report definition and shapes the result as an
 * `XlsxSheet` — shared by, without any `req`/`res` in sight, both the
 * Scheduled Reports subscription runner (Phase 3, docs/TODO.md) and the
 * Report Export Jobs background generator (docs/TODO.md's "Report
 * pagination and bounded exports"). Deliberately uncapped (no `limit`
 * passed to `runQuery`) — both of those callers exist specifically to
 * produce a report's full set outside a synchronous request/response cycle,
 * so there's nothing to bound here.
 */
export async function buildCustomReportSheet(
  user: AccessTokenPayload,
  input: RunReportInput,
  reportName?: string,
): Promise<{ sheets: XlsxSheet[]; rowCount: number }> {
  const { rows, comparingPeriods, periods } = await runQuery(user, input);
  const sheet: XlsxSheet = { name: "Report", columns: buildReportColumns(input, comparingPeriods), rows };
  const provenance = await describeCustomReport(user, input, periods, rows.length, reportName);
  return { sheets: [sheet, buildProvenanceSheet(provenance)], rowCount: rows.length };
}

async function describeFilters(institutionId: number, input: RunReportInput): Promise<string[]> {
  const defs = new Map(REPORT_FILTERS_BY_ENTITY[input.entityType].map((f) => [f.key, f]));
  const lines: string[] = [];
  for (const filter of input.filters) {
    const label = defs.get(filter.field)?.label ?? filter.field;
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    let shown = values.map(String);
    if (filter.field === "programId") {
      const rows = await prisma.program.findMany({ where: { id: { in: values as number[] }, institutionId }, select: { id: true, name: true } });
      shown = values.map((v) => rows.find((r) => r.id === v)?.name ?? String(v));
    } else if (filter.field === "campusId") {
      const rows = await prisma.campus.findMany({ where: { id: { in: values as number[] }, institutionId }, select: { id: true, name: true } });
      shown = values.map((v) => rows.find((r) => r.id === v)?.name ?? String(v));
    }
    lines.push(`${label}: ${shown.join(", ")}`);
  }
  return lines;
}

/**
 * The "Report Info" sheet for a custom report (docs/TODO.md "Report
 * provenance"). The current-vs-historical split matters most in
 * multi-period reports: a field with no reporting-period requirement (a
 * student's program, campus, enrollment status, contact info) is read from
 * the live record as of generation time — the same value on every period's
 * row — while a period-bound field (outcomes, CPL results) is what was
 * recorded/computed for that specific period. Listing them separately stops
 * a reader mistaking a current attribute for a historical fact.
 */
async function describeCustomReport(
  user: AccessTokenPayload,
  input: RunReportInput,
  periods: ResolvedPeriod[],
  rowCount: number,
  reportName?: string,
): Promise<ProvenanceEntry[]> {
  const fieldDefs = REPORT_FIELDS_BY_ENTITY[input.entityType];
  const selected = input.fields.map((key) => fieldDefs.find((d) => d.key === key)).filter((d) => !!d);
  const current = selected.filter((d) => !d.requiresReportingPeriod).map((d) => d.label);
  const periodBound = selected.filter((d) => d.requiresReportingPeriod).map((d) => d.label);
  const filterLines = await describeFilters(user.institutionId, input);

  const entries: ProvenanceEntry[] = [
    ["Report"],
    ...(reportName ? ([["Name", reportName]] as ProvenanceEntry[]) : []),
    ["Entity", input.entityType],
    ["Generated at", formatTimestamp(new Date())],
    ["Generated by", await describeGeneratedBy(user.sub)],
    ["Rows", String(rowCount)],
    ["Filters", filterLines.length > 0 ? filterLines.join("; ") : "None"],
    ["Reporting periods"],
    ...(await describePeriods(periods)),
    ["Data as of"],
  ];
  entries.push([
    "Current attributes",
    current.length > 0
      ? `${current.join(", ")} — read from live records at generation time, not as they were during the period`
      : "None selected",
  ]);
  entries.push([
    "Period-based values",
    periodBound.length > 0
      ? `${periodBound.join(", ")} — as recorded/computed for each row's reporting period`
      : "None selected",
  ]);
  return entries;
}

/**
 * The synchronous, in-request export — unlike buildCustomReportSheet above,
 * this one IS bounded: a report over REPORT_BUILDER_SYNC_EXPORT_THRESHOLD
 * rows risks tying up a request thread and hitting a client/proxy timeout,
 * so it's rejected here with a clear message pointing at the queued export
 * instead. Reuses the same bounded runQuery() call for both the size check
 * and (when under threshold) the actual export rows, rather than fetching
 * twice — when totalCount <= the limit passed in, nothing was truncated, so
 * the returned rows already are the complete matching set.
 */
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
export async function exportCustomReport(
  req: Request<Record<string, never>, unknown, RunReportInput>,
  res: Response,
) {
  const input = req.body;
<<<<<<< HEAD
  const sheet = await buildCustomReportSheet(req.user!, input);
  await sendXlsx(res, `custom-report-${input.entityType.toLowerCase()}.xlsx`, [sheet]);
=======
  const { rows, totalCount, comparingPeriods, periods } = await runQuery(
    req.user!,
    input,
    REPORT_BUILDER_SYNC_EXPORT_THRESHOLD,
  );
  if (totalCount > REPORT_BUILDER_SYNC_EXPORT_THRESHOLD) {
    throw ApiError.badRequest(
      `This report has ${totalCount} rows, over the ${REPORT_BUILDER_SYNC_EXPORT_THRESHOLD}-row limit for a direct download — queue it as a background export instead.`,
    );
  }
  const sheet: XlsxSheet = { name: "Report", columns: buildReportColumns(input, comparingPeriods), rows };
  const provenance = await describeCustomReport(req.user!, input, periods, rows.length);
  await sendXlsx(res, `custom-report-${input.entityType.toLowerCase()}.xlsx`, [
    sheet,
    buildProvenanceSheet(provenance),
  ]);
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}
