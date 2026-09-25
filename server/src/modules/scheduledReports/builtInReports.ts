import { CPL_METRICS, type BuiltInReportType } from "@outcomelink/shared";
import { getAccessibleProgramIds } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import type { AccessTokenPayload } from "../../lib/jwt";
import { prisma } from "../../lib/prisma";
import type { XlsxSheet } from "../../lib/xlsx";
import { computeEmployerAnalytics } from "../employers/analytics";
import { computeOutcomeFunnel, computeUnknownOutcomes } from "../reports/reports";
import { computeReadiness } from "../accreditation/readiness";

/**
 * The 4 built-in report types a ScheduledReportSubscription can point at
 * (see schema.prisma's BuiltInReportType doc comment for the "which spec §50
 * example maps to which existing report" reasoning). Each of the underlying
 * `compute*` functions already exists — this module's only job is resolving
 * the reporting period a run should use and shaping that report's data into
 * one representative `XlsxSheet`, not re-deriving anything.
 */

/**
 * `null` on the subscription means "whatever's current" rather than a period
 * fixed forever at subscribe time — resolved here to the institution's most
 * recently created reporting period (`id desc`, the same tiebreak
 * `reportingPeriods.list` already uses for "which period is current").
 * EMPLOYER_ANALYTICS is the one type that can genuinely run with no period
 * at all (all-time), matching its own existing endpoint's default.
 */
async function resolveReportingPeriodId(
  institutionId: number,
  builtInReportType: BuiltInReportType,
  fixedReportingPeriodId: number | null,
): Promise<number | undefined> {
  if (fixedReportingPeriodId) return fixedReportingPeriodId;
  if (builtInReportType === "EMPLOYER_ANALYTICS") return undefined;

  const mostRecent = await prisma.reportingPeriod.findFirst({
    where: { institutionId },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });
  if (!mostRecent) {
    throw ApiError.badRequest("No reporting period exists yet for this institution's built-in report to run against");
  }
  return mostRecent.id;
}

<<<<<<< HEAD
=======
/** Also returns the period actually used (a subscription with no fixed period runs against the most recent one), for the export's provenance. */
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
export async function buildBuiltInReportSheet(
  institutionId: number,
  creator: AccessTokenPayload,
  builtInReportType: BuiltInReportType,
  fixedReportingPeriodId: number | null,
<<<<<<< HEAD
): Promise<{ sheet: XlsxSheet; rowCount: number }> {
  const reportingPeriodId = await resolveReportingPeriodId(institutionId, builtInReportType, fixedReportingPeriodId);
=======
): Promise<{ sheet: XlsxSheet; rowCount: number; reportingPeriodId: number | undefined }> {
  const reportingPeriodId = await resolveReportingPeriodId(institutionId, builtInReportType, fixedReportingPeriodId);
  const built = await buildSheetFor(institutionId, creator, builtInReportType, reportingPeriodId);
  return { ...built, reportingPeriodId };
}

async function buildSheetFor(
  institutionId: number,
  creator: AccessTokenPayload,
  builtInReportType: BuiltInReportType,
  reportingPeriodId: number | undefined,
): Promise<{ sheet: XlsxSheet; rowCount: number }> {
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  const accessibleProgramIds = await getAccessibleProgramIds(creator);

  switch (builtInReportType) {
    case "OUTCOME_FUNNEL": {
      const data = await computeOutcomeFunnel(institutionId, reportingPeriodId!, accessibleProgramIds);
      return {
        rowCount: data.stages.length,
        sheet: {
          name: "Outcomes Summary",
          columns: [
            { header: "Stage", key: "stage", width: 24 },
            { header: "Count", key: "count", width: 12 },
          ],
          rows: data.stages,
        },
      };
    }
    case "UNKNOWN_OUTCOMES": {
      const data = await computeUnknownOutcomes(institutionId, reportingPeriodId!, accessibleProgramIds);
      const rows = data.students.map((s) => ({
        studentName: `${s.student.firstName} ${s.student.lastName}`,
        internalStudentId: s.student.internalStudentId,
        program: s.program?.name ?? "—",
      }));
      return {
        rowCount: rows.length,
        sheet: {
          name: "Missing Verification",
          columns: [
            { header: "Student", key: "studentName", width: 28 },
            { header: "Student ID", key: "internalStudentId", width: 14 },
            { header: "Program", key: "program", width: 28 },
          ],
          rows,
        },
      };
    }
    case "EMPLOYER_ANALYTICS": {
      const data = await computeEmployerAnalytics(institutionId, reportingPeriodId);
      const rows = data.topEmployers.map((e) => ({
        employerName: e.employer.name,
        industry: e.employer.industry ?? "—",
        placementCount: e.placementCount,
        relatedPlacementCount: e.relatedPlacementCount,
      }));
      return {
        rowCount: rows.length,
        sheet: {
          name: "Employer Report",
          columns: [
            { header: "Employer", key: "employerName", width: 28 },
            { header: "Industry", key: "industry", width: 22 },
            { header: "Placements", key: "placementCount", width: 14 },
            { header: "Related Placements", key: "relatedPlacementCount", width: 18 },
          ],
          rows,
        },
      };
    }
    case "CPL_READINESS": {
      const data = await computeReadiness(institutionId, reportingPeriodId!, accessibleProgramIds);
      const rows = data.readiness.map((r) => {
        const row: Record<string, unknown> = {
          program: r.program.name,
          ready: r.ready ? "Yes" : "No",
          openIssueCount: r.openIssueCount,
        };
        for (const metric of CPL_METRICS) {
          row[`${metric.toLowerCase()}Percentage`] = r.metrics[metric]?.percentage ?? null;
        }
        return row;
      });
      return {
        rowCount: rows.length,
        sheet: {
          name: "CPL Readiness",
          columns: [
            { header: "Program", key: "program", width: 28 },
            { header: "Ready", key: "ready", width: 10 },
            { header: "Open Issues", key: "openIssueCount", width: 14 },
            ...CPL_METRICS.map((metric) => ({
              header: `${metric.charAt(0)}${metric.slice(1).toLowerCase()} %`,
              key: `${metric.toLowerCase()}Percentage`,
              width: 16,
            })),
          ],
          rows,
        },
      };
    }
  }
}
