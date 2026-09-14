import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const createReportingPeriodSchema = z.object({
  ruleSetId: z.coerce.number().int().positive(),
  label: z.string().trim().min(1).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
type CreateReportingPeriodInput = z.infer<typeof createReportingPeriodSchema>;

export async function list(req: Request, res: Response) {
  const reportingPeriods = await prisma.reportingPeriod.findMany({
    where: { institutionId: req.user!.institutionId },
    orderBy: { startDate: "desc" },
  });
  sendData(res, { reportingPeriods });
}

export async function show(req: Request, res: Response) {
  const reportingPeriod = await prisma.reportingPeriod.findFirst({
    where: { id: Number(req.params.id), institutionId: req.user!.institutionId },
  });
  if (!reportingPeriod) throw ApiError.notFound("Reporting period not found");
  sendData(res, { reportingPeriod });
}

export async function create(
  req: Request<unknown, unknown, CreateReportingPeriodInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;

  if (req.body.endDate <= req.body.startDate) {
    throw ApiError.badRequest("endDate must be after startDate");
  }

  const ruleSet = await prisma.ruleSet.findUnique({ where: { id: req.body.ruleSetId } });
  if (!ruleSet) throw ApiError.badRequest("Unknown ruleSetId");

  const reportingPeriod = await prisma.reportingPeriod.create({
    data: { ...req.body, institutionId },
  });
  sendData(res, { reportingPeriod }, 201);
}
