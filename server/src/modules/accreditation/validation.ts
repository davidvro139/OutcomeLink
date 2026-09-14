import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
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
