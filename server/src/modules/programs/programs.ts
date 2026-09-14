import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { paginatedResponse } from "../../lib/crudHelpers";
import { paginationQuerySchema } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";

export const createProgramSchema = z.object({
  campusId: z.coerce.number().int().positive(),
  departmentId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(50),
  cipCode: z.string().trim().max(20).optional(),
  credentialType: z.string().trim().min(1).max(100),
  programLength: z.string().trim().max(100).optional(),
  clockHours: z.coerce.number().int().nonnegative().optional(),
  creditHours: z.coerce.number().int().nonnegative().optional(),
  licensureRequired: z.boolean().default(false),
  accreditationReportingStatus: z.string().trim().max(100).optional(),
  active: z.boolean().default(true),
  effectiveStartDate: z.coerce.date().optional(),
  effectiveEndDate: z.coerce.date().optional(),
});
type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const updateProgramSchema = createProgramSchema.partial();
type UpdateProgramInput = z.infer<typeof updateProgramSchema>;

export const listProgramsQuerySchema = paginationQuerySchema.extend({
  campusId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  active: z.coerce.boolean().optional(),
});
type ListProgramsQuery = z.infer<typeof listProgramsQuerySchema>;

async function findOwnedProgram(institutionId: number, id: number) {
  const program = await prisma.program.findFirst({ where: { id, institutionId } });
  if (!program) throw ApiError.notFound("Program not found");
  return program;
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, campusId, departmentId, active } =
    req.query as unknown as ListProgramsQuery;
  const institutionId = req.user!.institutionId;
  const where = { institutionId, campusId, departmentId, active };

  await paginatedResponse(
    res,
    page,
    pageSize,
    (skip, take) => prisma.program.findMany({ where, skip, take, orderBy: { name: "asc" } }),
    () => prisma.program.count({ where }),
  );
}

export async function show(req: Request, res: Response) {
  const program = await findOwnedProgram(req.user!.institutionId, Number(req.params.id));
  sendData(res, { program });
}

export async function create(req: Request<unknown, unknown, CreateProgramInput>, res: Response) {
  const program = await prisma.program.create({
    data: { ...req.body, institutionId: req.user!.institutionId },
  });
  sendData(res, { program }, 201);
}

export async function update(
  req: Request<{ id: string }, unknown, UpdateProgramInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  await findOwnedProgram(req.user!.institutionId, id);
  const program = await prisma.program.update({ where: { id }, data: req.body });
  sendData(res, { program });
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await findOwnedProgram(req.user!.institutionId, id);
  await prisma.program.delete({ where: { id } });
  sendData(res, { deleted: true });
}
