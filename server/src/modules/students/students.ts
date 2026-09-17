import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { paginatedResponse } from "../../lib/crudHelpers";
import { paginationQuerySchema } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";
import { sendXlsx } from "../../lib/xlsx";

/**
 * A plain `contains: search` against one column meant a search for
 * "Isobel Yost" matched nothing, since neither firstName nor lastName holds
 * that whole phrase — only single-token searches ever worked. Splitting on
 * whitespace and requiring every token to match some field (not necessarily
 * the same one) fixes full-name search without needing full-text search.
 */
export function studentNameSearchFilter(search: string): Prisma.StudentWhereInput {
  const tokens = search.trim().split(/\s+/).filter(Boolean);
  return {
    AND: tokens.map((token) => ({
      OR: [
        { firstName: { contains: token } },
        { lastName: { contains: token } },
        { internalStudentId: { contains: token } },
      ],
    })),
  };
}

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

  const where: Prisma.StudentWhereInput = {
    institutionId,
    ...(search && studentNameSearchFilter(search)),
  };

  await paginatedResponse(
    res,
    page,
    pageSize,
    (skip, take) => prisma.student.findMany({ where, skip, take, orderBy: { lastName: "asc" } }),
    () => prisma.student.count({ where }),
  );
}

/** Phase 2 P7 (docs/TODO.md): the institution's student roster as a downloadable .xlsx. */
export async function exportStudents(req: Request, res: Response) {
  const { search } = req.query as unknown as ListStudentsQuery;
  const institutionId = req.user!.institutionId;

  const students = await prisma.student.findMany({
    where: {
      institutionId,
      ...(search && studentNameSearchFilter(search)),
    },
    include: { communicationPreference: true },
    orderBy: { lastName: "asc" },
  });

  await sendXlsx(res, "students.xlsx", [
    {
      name: "Students",
      columns: [
        { header: "Internal Student ID", key: "internalStudentId", width: 20 },
        { header: "First Name", key: "firstName", width: 18 },
        { header: "Last Name", key: "lastName", width: 18 },
        { header: "Email", key: "email", width: 28 },
        { header: "Phone", key: "phone", width: 16 },
        { header: "Do Not Contact", key: "doNotContact", width: 16 },
      ],
      rows: students.map((s) => ({
        internalStudentId: s.internalStudentId,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email ?? "",
        phone: s.phone ?? "",
        doNotContact: s.communicationPreference?.doNotContact ? "Yes" : "No",
      })),
    },
  ]);
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
