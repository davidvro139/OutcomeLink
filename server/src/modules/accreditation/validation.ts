import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { sendXlsx } from "../../lib/xlsx";
import { runValidation } from "./validators/validationEngine";

async function findOwnedPeriod(institutionId: number, reportingPeriodId: number) {
  const period = await prisma.reportingPeriod.findFirst({
    where: { id: reportingPeriodId, institutionId },
  });
  if (!period) throw ApiError.notFound("Reporting period not found");
  return period;
}

export async function validate(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);
  await runValidation(reportingPeriodId);
  sendData(res, { validated: true });
}

export const listIssuesQuerySchema = z.object({
  severity: z.enum(["ERROR", "WARNING", "INFORMATION"]).optional(),
  includeResolved: z.coerce.boolean().default(false),
});
type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;

export async function listIssues(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);
  const { severity, includeResolved } = req.query as unknown as ListIssuesQuery;

  const issues = await prisma.validationIssue.findMany({
    where: {
      reportingPeriodId,
      severity,
      ...(includeResolved ? {} : { resolvedAt: null }),
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      program: { select: { id: true, name: true } },
    },
    orderBy: [{ severity: "asc" }, { id: "asc" }],
  });
  sendData(res, { issues });
}

/** Phase 2 P7 (docs/TODO.md): the Validation tab's issue list as a downloadable .xlsx. */
export async function exportIssues(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  const period = await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);
  const { severity, includeResolved } = req.query as unknown as ListIssuesQuery;

  const issues = await prisma.validationIssue.findMany({
    where: {
      reportingPeriodId,
      severity,
      ...(includeResolved ? {} : { resolvedAt: null }),
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      program: { select: { id: true, name: true } },
    },
    orderBy: [{ severity: "asc" }, { id: "asc" }],
  });

  await sendXlsx(res, `validation-issues-${period.label}.xlsx`, [
    {
      name: "Validation Issues",
      columns: [
        { header: "Issue Type", key: "issueType", width: 34 },
        { header: "Severity", key: "severity", width: 14 },
        { header: "Student", key: "student", width: 26 },
        { header: "Program", key: "program", width: 26 },
        { header: "Detected At", key: "detectedAt", width: 20 },
        { header: "Resolved At", key: "resolvedAt", width: 20 },
        { header: "Resolved By", key: "resolvedBy", width: 20 },
      ],
      rows: issues.map((i) => ({
        issueType: i.issueType,
        severity: i.severity,
        student: i.student ? `${i.student.firstName} ${i.student.lastName}` : "",
        program: i.program?.name ?? "",
        detectedAt: i.detectedAt.toISOString(),
        resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : "",
        resolvedBy: i.resolvedBy ?? "",
      })),
    },
  ]);
}

export async function resolveIssue(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  const issueId = Number(req.params.issueId);
  await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);

  const issue = await prisma.validationIssue.findFirst({
    where: { id: issueId, reportingPeriodId },
  });
  if (!issue) throw ApiError.notFound("Validation issue not found");

  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { name: true },
  });
  const resolved = await prisma.validationIssue.update({
    where: { id: issueId },
    data: { resolvedAt: new Date(), resolvedBy: user?.name ?? String(req.user!.sub) },
  });
  sendData(res, { issue: resolved });
}
