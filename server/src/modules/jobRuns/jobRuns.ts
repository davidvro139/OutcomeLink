import { JOB_RUN_STATUSES, JOB_TYPES } from "@outcomelink/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { paginatedResponse } from "../../lib/crudHelpers";
import { retryFailedRun } from "../../lib/jobRunner";
import { paginationQuerySchema } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";

export const listJobRunsQuerySchema = paginationQuerySchema.extend({
  jobType: z.enum(JOB_TYPES).optional(),
  status: z.enum(JOB_RUN_STATUSES).optional(),
});
type ListJobRunsQuery = z.infer<typeof listJobRunsQuerySchema>;

/** An admin sees their own institution's runs; a system-wide run (no institution) is the System Administrator's alone. */
function visibleTo(user: NonNullable<Request["user"]>) {
  return user.role === "SYSTEM_ADMINISTRATOR"
    ? { OR: [{ institutionId: user.institutionId }, { institutionId: null }] }
    : { institutionId: user.institutionId };
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, jobType, status } = req.query as unknown as ListJobRunsQuery;
  const where = { ...visibleTo(req.user!), jobType, status };
  await paginatedResponse(
    res,
    page,
    pageSize,
    (skip, take) => prisma.jobRun.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    () => prisma.jobRun.count({ where }),
  );
}

export async function retry(req: Request, res: Response) {
  const id = Number(req.params.id);
  const visible = await prisma.jobRun.findFirst({ where: { id, ...visibleTo(req.user!) }, select: { status: true } });
  if (!visible) throw ApiError.notFound("Job run not found");
  if (visible.status !== "FAILED") throw ApiError.conflict("Only a failed run can be retried");

  const run = await retryFailedRun(id);
  if (!run) throw ApiError.conflict("Only a failed run can be retried");
  sendData(res, { run });
}
