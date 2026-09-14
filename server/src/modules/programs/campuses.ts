import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { paginatedResponse } from "../../lib/crudHelpers";
import { paginationQuerySchema, type PaginationQuery } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";

export const createCampusSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(1000).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  zip: z.string().trim().max(20).optional(),
});
type CreateCampusInput = z.infer<typeof createCampusSchema>;

export const updateCampusSchema = createCampusSchema.partial();
type UpdateCampusInput = z.infer<typeof updateCampusSchema>;

export const listCampusesQuerySchema = paginationQuerySchema;

async function findOwnedCampus(institutionId: number, id: number) {
  const campus = await prisma.campus.findFirst({ where: { id, institutionId } });
  if (!campus) throw ApiError.notFound("Campus not found");
  return campus;
}

export async function list(req: Request, res: Response) {
  // Express types req.query as ParsedQs; validate(schema, "query") has already
  // coerced/validated it to PaginationQuery at runtime by the time we get here.
  const { page, pageSize } = req.query as unknown as PaginationQuery;
  const institutionId = req.user!.institutionId;
  await paginatedResponse(
    res,
    page,
    pageSize,
    (skip, take) =>
      prisma.campus.findMany({ where: { institutionId }, skip, take, orderBy: { name: "asc" } }),
    () => prisma.campus.count({ where: { institutionId } }),
  );
}

export async function show(req: Request, res: Response) {
  const campus = await findOwnedCampus(req.user!.institutionId, Number(req.params.id));
  sendData(res, { campus });
}

export async function create(req: Request<unknown, unknown, CreateCampusInput>, res: Response) {
  const campus = await prisma.campus.create({
    data: { ...req.body, institutionId: req.user!.institutionId },
  });
  sendData(res, { campus }, 201);
}

export async function update(
  req: Request<{ id: string }, unknown, UpdateCampusInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  await findOwnedCampus(req.user!.institutionId, id);
  const campus = await prisma.campus.update({ where: { id }, data: req.body });
  sendData(res, { campus });
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await findOwnedCampus(req.user!.institutionId, id);
  await prisma.campus.delete({ where: { id } });
  sendData(res, { deleted: true });
}
