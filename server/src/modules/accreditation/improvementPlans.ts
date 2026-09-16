import type { Request, Response } from "express";
import { CPL_METRICS, IMPROVEMENT_PLAN_STATUSES } from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const createImprovementPlanSchema = z.object({
  programId: z.coerce.number().int().positive(),
  metric: z.enum(CPL_METRICS),
  reportingPeriodId: z.coerce.number().int().positive(),
  currentResult: z.coerce.number().min(0).max(100).optional(),
  target: z.coerce.number().min(0).max(100).optional(),
  problemDescription: z.string().trim().max(5000).optional(),
  rootCause: z.string().trim().max(5000).optional(),
  responsibleUserId: z.coerce.number().int().positive(),
  dueDate: z.coerce.date().optional(),
});
type CreateImprovementPlanInput = z.infer<typeof createImprovementPlanSchema>;

export const updateImprovementPlanSchema = createImprovementPlanSchema.partial().extend({
  status: z.enum(IMPROVEMENT_PLAN_STATUSES).optional(),
});
type UpdateImprovementPlanInput = z.infer<typeof updateImprovementPlanSchema>;

export const createImprovementPlanUpdateSchema = z.object({
  updateText: z.string().trim().min(1).max(5000),
  correctiveAction: z.string().trim().max(5000).optional(),
  supportingEvidenceId: z.coerce.number().int().positive().optional(),
});
type CreateImprovementPlanUpdateInput = z.infer<typeof createImprovementPlanUpdateSchema>;

export const listImprovementPlansQuerySchema = z.object({
  reportingPeriodId: z.coerce.number().int().positive().optional(),
  programId: z.coerce.number().int().positive().optional(),
  status: z.enum(IMPROVEMENT_PLAN_STATUSES).optional(),
});
type ListImprovementPlansQuery = z.infer<typeof listImprovementPlansQuerySchema>;

const planInclude = {
  program: { select: { id: true, name: true } },
  reportingPeriod: { select: { id: true, label: true } },
  responsibleUser: { select: { id: true, name: true } },
} as const;

async function findOwnedPlan(institutionId: number, id: number) {
  const plan = await prisma.improvementPlan.findFirst({
    where: { id, program: { institutionId } },
    include: { ...planInclude, updates: { orderBy: { createdAt: "desc" } } },
  });
  if (!plan) throw ApiError.notFound("Improvement plan not found");
  return plan;
}

export async function list(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId, programId, status } = req.query as unknown as ListImprovementPlansQuery;

  const improvementPlans = await prisma.improvementPlan.findMany({
    where: { program: { institutionId }, reportingPeriodId, programId, status },
    include: { ...planInclude, _count: { select: { updates: true } } },
    orderBy: { id: "desc" },
  });
  sendData(res, { improvementPlans });
}

export async function show(req: Request, res: Response) {
  const plan = await findOwnedPlan(req.user!.institutionId, Number(req.params.id));
  sendData(res, { improvementPlan: plan });
}

export async function create(
  req: Request<unknown, unknown, CreateImprovementPlanInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;

  const program = await prisma.program.findFirst({
    where: { id: req.body.programId, institutionId },
  });
  if (!program) throw ApiError.badRequest("Unknown programId");

  const reportingPeriod = await prisma.reportingPeriod.findFirst({
    where: { id: req.body.reportingPeriodId, institutionId },
  });
  if (!reportingPeriod) throw ApiError.badRequest("Unknown reportingPeriodId");

  const responsibleUser = await prisma.user.findFirst({
    where: { id: req.body.responsibleUserId, institutionId },
  });
  if (!responsibleUser) throw ApiError.badRequest("Unknown responsibleUserId");

  const improvementPlan = await prisma.improvementPlan.create({
    data: req.body,
    include: planInclude,
  });
  sendData(res, { improvementPlan }, 201);
}

export async function update(
  req: Request<{ id: string }, unknown, UpdateImprovementPlanInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  await findOwnedPlan(req.user!.institutionId, id);

  const improvementPlan = await prisma.improvementPlan.update({
    where: { id },
    data: req.body,
    include: planInclude,
  });
  sendData(res, { improvementPlan });
}

export async function addUpdate(
  req: Request<{ id: string }, unknown, CreateImprovementPlanUpdateInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  await findOwnedPlan(req.user!.institutionId, id);

  const actingUser = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { name: true },
  });

  const update = await prisma.improvementPlanUpdate.create({
    data: {
      improvementPlanId: id,
      ...req.body,
      createdBy: actingUser?.name ?? String(req.user!.sub),
    },
  });
  sendData(res, { update }, 201);
}
