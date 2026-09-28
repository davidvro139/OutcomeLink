import type { Request, Response } from "express";
import { z } from "zod";
import { getAccessibleProgramIds, getProgramNotificationRecipients } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { sendXlsx } from "../../lib/xlsx";
import { runValidation } from "./validators/validationEngine";

/** A null programId (e.g. a duplicate-student issue) isn't owned by any one program, so it's visible to every scoped role. */
function issueProgramScopeFilter(accessibleProgramIds: number[] | null) {
  return accessibleProgramIds
    ? { OR: [{ programId: null }, { programId: { in: accessibleProgramIds } }] }
    : {};
}

async function findOwnedPeriod(institutionId: number, reportingPeriodId: number) {
  const period = await prisma.reportingPeriod.findFirst({
    where: { id: reportingPeriodId, institutionId },
  });
  if (!period) throw ApiError.notFound("Reporting period not found");
  return period;
}

export async function validate(req: Request, res: Response) {
  const reportingPeriodId = Number(req.params.id);
  const period = await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);
  await runValidationAndNotify(reportingPeriodId, period.institutionId);
  sendData(res, { validated: true });
}

function openIssueKey(issue: { issueType: string; studentId: number | null; programId: number | null }): string {
  return JSON.stringify([issue.issueType, issue.studentId, issue.programId]);
}

/**
 * Recipient for a new ERROR-severity issue: that program's configured
 * ProgramFollowUpOwner (Advanced Workflow Automation, Phase 3, docs/TODO.md)
 * if one exists, else Program Administrators with access to it, else — for
 * an issue with no programId at all (e.g. a duplicate-student check) —
 * institution-wide administrators directly.
 */
async function resolveValidationRecipients(
  programId: number | null,
  institutionId: number,
): Promise<{ id: number }[]> {
  if (programId === null) {
    return prisma.user.findMany({
      where: { institutionId, role: { in: ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"] }, active: true },
      select: { id: true },
    });
  }
  const owner = await prisma.programFollowUpOwner.findUnique({ where: { programId } });
  if (owner) return [{ id: owner.staffUserId }];
  return getProgramNotificationRecipients(programId, institutionId);
}

/**
 * Wraps runValidation() with a diff against the issue set open *before* this
 * run — runValidation deletes and recreates every open issue from scratch
 * each time, so "notify on new issues" has to compare against what was
 * already open, not just "an issue got created." Shared by the manual
 * "Run Validation" button and the nightly automatic re-run (Advanced
 * Workflow Automation), so both trigger identical notification behavior.
 * Only ERROR severity notifies — WARNING/INFORMATION would be noisy on
 * institutions with a lot of open issues. Grouped by recipient, one digest
 * notification per recipient per run, not one per issue — same anti-spam
 * shape as the missing-outcomes digest and Scheduled Reports.
 */
export async function runValidationAndNotify(reportingPeriodId: number, institutionId: number): Promise<void> {
  const before = await prisma.validationIssue.findMany({
    where: { reportingPeriodId, resolvedAt: null },
    select: { issueType: true, studentId: true, programId: true },
  });
  const beforeKeys = new Set(before.map(openIssueKey));

  await runValidation(reportingPeriodId);

  const after = await prisma.validationIssue.findMany({
    where: { reportingPeriodId, resolvedAt: null, severity: "ERROR" },
    select: { issueType: true, studentId: true, programId: true },
  });
  const newIssues = after.filter((issue) => !beforeKeys.has(openIssueKey(issue)));
  if (newIssues.length === 0) return;

  const countByProgramId = new Map<number | null, number>();
  for (const issue of newIssues) {
    const key = issue.programId ?? null;
    countByProgramId.set(key, (countByProgramId.get(key) ?? 0) + 1);
  }

  const period = await prisma.reportingPeriod.findUnique({
    where: { id: reportingPeriodId },
    select: { label: true },
  });

  const countByUserId = new Map<number, number>();
  for (const [programId, count] of countByProgramId) {
    for (const recipient of await resolveValidationRecipients(programId, institutionId)) {
      countByUserId.set(recipient.id, (countByUserId.get(recipient.id) ?? 0) + count);
    }
  }

  await Promise.all(
    [...countByUserId].map(([userId, count]) =>
      createNotification({
        userId,
        type: "VALIDATION_ERROR",
        message: `${count} new validation error${count === 1 ? "" : "s"} found in "${period?.label ?? reportingPeriodId}".`,
        referenceEntityType: "ReportingPeriod",
        referenceEntityId: reportingPeriodId,
      }),
    ),
  );
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
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const issues = await prisma.validationIssue.findMany({
    where: {
      reportingPeriodId,
      severity,
      ...(includeResolved ? {} : { resolvedAt: null }),
      ...issueProgramScopeFilter(accessibleProgramIds),
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
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const issues = await prisma.validationIssue.findMany({
    where: {
      reportingPeriodId,
      severity,
      ...(includeResolved ? {} : { resolvedAt: null }),
      ...issueProgramScopeFilter(accessibleProgramIds),
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
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const issue = await prisma.validationIssue.findFirst({
    where: { id: issueId, reportingPeriodId, ...issueProgramScopeFilter(accessibleProgramIds) },
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

export const bulkResolveIssuesSchema = z.object({
  issueIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
});
type BulkResolveIssuesInput = z.infer<typeof bulkResolveIssuesSchema>;

/**
 * Phase 2 P11 (docs/TODO.md): resolve many open issues at once (e.g. a batch
 * of INFORMATION-severity rows already handled some other way) instead of
 * clicking "Resolve" one row at a time. Scoped to issues actually belonging
 * to this reporting period, same as resolveIssue above; anything in the
 * request that doesn't match (wrong period, already resolved, unknown id) is
 * silently excluded from the update rather than failing the whole batch —
 * the response reports how many were actually resolved.
 */
export async function bulkResolveIssues(
  req: Request<{ id: string }, unknown, BulkResolveIssuesInput>,
  res: Response,
) {
  const reportingPeriodId = Number(req.params.id);
  await findOwnedPeriod(req.user!.institutionId, reportingPeriodId);
  const { issueIds } = req.body;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { name: true },
  });

  const result = await prisma.validationIssue.updateMany({
    where: {
      id: { in: issueIds },
      reportingPeriodId,
      resolvedAt: null,
      ...issueProgramScopeFilter(accessibleProgramIds),
    },
    data: { resolvedAt: new Date(), resolvedBy: user?.name ?? String(req.user!.sub) },
  });
  sendData(res, { resolvedCount: result.count });
}
