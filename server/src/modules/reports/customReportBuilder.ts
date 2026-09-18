import type { Request, Response } from "express";
import {
  REPORT_BUILDER_PREVIEW_LIMIT,
  REPORT_ENTITY_TYPES,
  REPORT_FIELDS_BY_ENTITY,
  REPORT_FILTERS_BY_ENTITY,
  type ReportEntityType,
} from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { sendXlsx } from "../../lib/xlsx";

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
 */

const filterInputSchema = z.object({
  field: z.string(),
  value: z.union([z.array(z.string()), z.array(z.number()), z.boolean()]),
});

export const runReportSchema = z.object({
  entityType: z.enum(REPORT_ENTITY_TYPES),
  fields: z.array(z.string()).min(1).max(50),
  filters: z.array(filterInputSchema).max(20).default([]),
  reportingPeriodId: z.coerce.number().int().positive().optional(),
});
export type RunReportInput = z.infer<typeof runReportSchema>;

type Row = Record<string, unknown>;

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

  const filterDefs = new Map(REPORT_FILTERS_BY_ENTITY[input.entityType].map((f) => [f.key, f]));
  for (const filter of input.filters) {
    const def = filterDefs.get(filter.field);
    if (!def) throw ApiError.badRequest(`Unknown filter field "${filter.field}" for ${input.entityType}`);
    if (def.requiresReportingPeriod && !input.reportingPeriodId) {
      throw ApiError.badRequest(`Filter "${filter.field}" requires a reporting period`);
    }
  }

  const needsPeriod = input.fields.some(
    (f) => fieldDefs.find((d) => d.key === f)?.requiresReportingPeriod,
  );
  if (needsPeriod && !input.reportingPeriodId) {
    throw ApiError.badRequest("Selected fields require a reporting period");
  }
}

async function fetchStudentRows(institutionId: number, input: RunReportInput): Promise<Row[]> {
  const programIds = filterValue<number[]>(input, "programId");
  const campusIds = filterValue<number[]>(input, "campusId");
  const enrollmentStatuses = filterValue<string[]>(input, "enrollmentStatus");
  const employmentStatuses = filterValue<string[]>(input, "employmentStatus");

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      student: { institutionId },
      ...(programIds && programIds.length > 0 ? { programId: { in: programIds } } : {}),
      ...(campusIds && campusIds.length > 0 ? { campusId: { in: campusIds } } : {}),
      ...(enrollmentStatuses && enrollmentStatuses.length > 0
        ? { enrollmentStatus: { in: enrollmentStatuses as never[] } }
        : {}),
    },
    include: {
      student: true,
      program: { select: { name: true } },
      campus: { select: { name: true } },
      // A conditional `include` (object vs. `false`) makes Prisma infer a
      // union type that loses the nested `employer` relation entirely — kept
      // the shape static instead, using a reportingPeriodId that can never
      // match a real row (0) when no period was actually requested, so
      // "no period selected" and "no outcome record for this period" behave
      // identically (an empty outcomeRecords array) without a type gymnastic.
      outcomeRecords: {
        where: { reportingPeriodId: input.reportingPeriodId ?? 0 },
        include: { employer: { select: { name: true } } },
      },
    },
    orderBy: { id: "asc" },
  });

  let rows: Row[] = enrollments.map((e) => {
    const outcome = e.outcomeRecords[0];
    return {
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
  });

  if (employmentStatuses && employmentStatuses.length > 0) {
    rows = rows.filter((r) => employmentStatuses.includes(r.employmentStatus as string));
  }

  return rows;
}

async function fetchEmployerRows(institutionId: number, input: RunReportInput): Promise<Row[]> {
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
    include: { employmentRecords: { select: { fullTime: true, salaryOrWage: true } } },
    orderBy: { name: "asc" },
  });

  return employers.map((e) => {
    const wages = e.employmentRecords
      .map((r) => (r.salaryOrWage !== null ? Number(r.salaryOrWage) : null))
      .filter((w): w is number => w !== null);
    const fullTimeCount = e.employmentRecords.filter((r) => r.fullTime).length;
    return {
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
  });
}

async function fetchProgramRows(institutionId: number, input: RunReportInput): Promise<Row[]> {
  const campusIds = filterValue<number[]>(input, "campusId");
  const credentialTypes = filterValue<string[]>(input, "credentialType");
  const licensureRequiredFilter = filterValue<boolean>(input, "licensureRequired");

  const programs = await prisma.program.findMany({
    where: {
      institutionId,
      ...(campusIds && campusIds.length > 0 ? { campusId: { in: campusIds } } : {}),
      ...(credentialTypes && credentialTypes.length > 0 ? { credentialType: { in: credentialTypes } } : {}),
      ...(licensureRequiredFilter !== undefined ? { licensureRequired: licensureRequiredFilter } : {}),
    },
    include: { campus: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const cplByProgram = new Map<number, Partial<Record<"COMPLETION" | "PLACEMENT" | "LICENSURE", number>>>();
  if (input.reportingPeriodId) {
    const results = await prisma.cplCalculationResult.findMany({
      where: { reportingPeriodId: input.reportingPeriodId, programId: { in: programs.map((p) => p.id) } },
    });
    for (const r of results) {
      if (!r.programId) continue;
      const entry = cplByProgram.get(r.programId) ?? {};
      entry[r.metric] = Number(r.percentage);
      cplByProgram.set(r.programId, entry);
    }
  }

  return programs.map((p) => {
    const cpl = cplByProgram.get(p.id) ?? {};
    return {
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
  });
}

const FETCHERS: Record<ReportEntityType, (institutionId: number, input: RunReportInput) => Promise<Row[]>> = {
  STUDENT: fetchStudentRows,
  EMPLOYER: fetchEmployerRows,
  PROGRAM: fetchProgramRows,
};

function pickFields(row: Row, fields: string[]): Row {
  return Object.fromEntries(fields.map((f) => [f, row[f] ?? null]));
}

async function runQuery(institutionId: number, input: RunReportInput): Promise<Row[]> {
  validateDefinition(input);
  const allRows = await FETCHERS[input.entityType](institutionId, input);
  return allRows.map((row) => pickFields(row, input.fields));
}

export async function runCustomReport(
  req: Request<Record<string, never>, unknown, RunReportInput>,
  res: Response,
) {
  const rows = await runQuery(req.user!.institutionId, req.body);
  sendData(res, {
    rows: rows.slice(0, REPORT_BUILDER_PREVIEW_LIMIT),
    totalCount: rows.length,
    truncated: rows.length > REPORT_BUILDER_PREVIEW_LIMIT,
  });
}

export async function exportCustomReport(
  req: Request<Record<string, never>, unknown, RunReportInput>,
  res: Response,
) {
  const input = req.body;
  const rows = await runQuery(req.user!.institutionId, input);
  const fieldDefs = REPORT_FIELDS_BY_ENTITY[input.entityType];

  await sendXlsx(res, `custom-report-${input.entityType.toLowerCase()}.xlsx`, [
    {
      name: "Report",
      columns: input.fields.map((key) => ({
        header: fieldDefs.find((d) => d.key === key)?.label ?? key,
        key,
        width: 22,
      })),
      rows,
    },
  ]);
}
