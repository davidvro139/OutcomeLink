import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { paginatedResponse } from "../../lib/crudHelpers";
import { paginationQuerySchema, type PaginationQuery } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.partial();
type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const listDepartmentsQuerySchema = paginationQuerySchema;

async function findOwnedDepartment(institutionId: number, id: number) {
  const department = await prisma.department.findFirst({ where: { id, institutionId } });
  if (!department) throw ApiError.notFound("Department not found");
  return department;
}

export async function list(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as PaginationQuery;
  const institutionId = req.user!.institutionId;
  await paginatedResponse(
    res,
    page,
    pageSize,
    (skip, take) =>
      prisma.department.findMany({
        where: { institutionId },
        skip,
        take,
        orderBy: { name: "asc" },
      }),
    () => prisma.department.count({ where: { institutionId } }),
  );
}

export async function show(req: Request, res: Response) {
  const department = await findOwnedDepartment(req.user!.institutionId, Number(req.params.id));
  sendData(res, { department });
}

export async function create(req: Request<unknown, unknown, CreateDepartmentInput>, res: Response) {
  const department = await prisma.department.create({
    data: { ...req.body, institutionId: req.user!.institutionId },
  });
  sendData(res, { department }, 201);
}

export async function update(
  req: Request<{ id: string }, unknown, UpdateDepartmentInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  await findOwnedDepartment(req.user!.institutionId, id);
  const department = await prisma.department.update({ where: { id }, data: req.body });
  sendData(res, { department });
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await findOwnedDepartment(req.user!.institutionId, id);
  await prisma.department.delete({ where: { id } });
  sendData(res, { deleted: true });
}
