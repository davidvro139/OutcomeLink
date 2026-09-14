import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { paginatedResponse } from "../../lib/crudHelpers";
import { paginationQuerySchema } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";

export const createStudentSchema = z.object({
  internalStudentId: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  preferredName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(30).optional(),
});
type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.omit({ internalStudentId: true }).partial();
type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const listStudentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
});
type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;

async function findOwnedStudent(institutionId: number, id: number) {
  const student = await prisma.student.findFirst({ where: { id, institutionId } });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, search } = req.query as unknown as ListStudentsQuery;
  const institutionId = req.user!.institutionId;

  const where = {
    institutionId,
    ...(search && {
      OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { internalStudentId: { contains: search } },
      ],
    }),
  };

  await paginatedResponse(
    res,
    page,
    pageSize,
    (skip, take) => prisma.student.findMany({ where, skip, take, orderBy: { lastName: "asc" } }),
    () => prisma.student.count({ where }),
  );
}

export async function show(req: Request, res: Response) {
  const student = await prisma.student.findFirst({
    where: { id: Number(req.params.id), institutionId: req.user!.institutionId },
    include: { communicationPreference: true },
  });
  if (!student) throw ApiError.notFound("Student not found");
  sendData(res, { student });
}

export async function create(req: Request<unknown, unknown, CreateStudentInput>, res: Response) {
  const institutionId = req.user!.institutionId;

  const duplicate = await prisma.student.findUnique({
    where: {
      institutionId_internalStudentId: {
        institutionId,
        internalStudentId: req.body.internalStudentId,
      },
    },
  });
  if (duplicate) throw ApiError.conflict("A student with this internal ID already exists");

  const student = await prisma.student.create({ data: { ...req.body, institutionId } });
  sendData(res, { student }, 201);
}

export async function update(
  req: Request<{ id: string }, unknown, UpdateStudentInput>,
  res: Response,
) {
  const id = Number(req.params.id);
  await findOwnedStudent(req.user!.institutionId, id);
  const student = await prisma.student.update({ where: { id }, data: req.body });
  sendData(res, { student });
}
