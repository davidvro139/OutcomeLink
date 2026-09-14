import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { paginatedResponse } from "../../lib/crudHelpers";
import { paginationQuerySchema } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";

export const createEmployerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  industry: z.string().trim().max(200).optional(),
  naicsCode: z.string().trim().max(20).optional(),
  address: z.string().trim().max(1000).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  zip: z.string().trim().max(20).optional(),
  website: z.string().trim().url().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  active: z.boolean().default(true),
});
type CreateEmployerInput = z.infer<typeof createEmployerSchema>;

export const updateEmployerSchema = createEmployerSchema.partial();
type UpdateEmployerInput = z.infer<typeof updateEmployerSchema>;

export const listEmployersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  active: z.coerce.boolean().optional(),
});
type ListEmployersQuery = z.infer<typeof listEmployersQuerySchema>;

async function findOwnedEmployer(institutionId: number, id: number) {
  const employer = await prisma.employer.findFirst({ where: { id, institutionId } });
  if (!employer) throw ApiError.notFound("Employer not found");
  return employer;
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, search, active } = req.query as unknown as ListEmployersQuery;
  const institutionId = req.user!.institutionId;
  const where = {
    institutionId,
    active,
    ...(search && { name: { contains: search } }),
  };

  await paginatedResponse(
    res,
    page,
    pageSize,
    (skip, take) => prisma.employer.findMany({ where, skip, take, orderBy: { name: "asc" } }),
    () => prisma.employer.count({ where }),
  );
}

export async function show(req: Request, res: Response) {
  const employer = await prisma.employer.findFirst({
    where: { id: Number(req.params.id), institutionId: req.user!.institutionId },
    include: { contacts: true },
  });
  if (!employer) throw ApiError.notFound("Employer not found");
  sendData(res, { employer });
}

export async function create(req: Request<unknown, unknown, CreateEmployerInput>, res: Response) {
  const employer = await prisma.employer.create({
    data: { ...req.body, institutionId: req.user!.institutionId },
  });
  sendData(res, { employer }, 201);
}

export async function update(
  req: Request<{ id: string }, unknown, UpdateEmployerInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  await findOwnedEmployer(req.user!.institutionId, id);
  const employer = await prisma.employer.update({ where: { id }, data: req.body });
  sendData(res, { employer });
}
