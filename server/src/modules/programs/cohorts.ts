import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const createCohortSchema = z.object({
  name: z.string().trim().min(1).max(200),
  entryTerm: z.string().trim().max(50).optional(),
  entryYear: z.coerce.number().int().min(1900).max(3000).optional(),
});
type CreateCohortInput = z.infer<typeof createCohortSchema>;

export const updateCohortSchema = createCohortSchema.partial();
type UpdateCohortInput = z.infer<typeof updateCohortSchema>;

async function findOwnedProgram(institutionId: number, programId: number) {
  const program = await prisma.program.findFirst({ where: { id: programId, institutionId } });
  if (!program) throw ApiError.notFound("Program not found");
  return program;
}

export async function list(req: Request, res: Response) {
  const programId = Number(req.params.programId);
  await findOwnedProgram(req.user!.institutionId, programId);
  const cohorts = await prisma.cohort.findMany({ where: { programId }, orderBy: { name: "asc" } });
  sendData(res, { cohorts });
}

export async function create(
  req: Request<{ programId: string }, unknown, CreateCohortInput>,
  res: Response,
) {
  const programId = Number(req.params.programId);
  await findOwnedProgram(req.user!.institutionId, programId);
  const cohort = await prisma.cohort.create({ data: { ...req.body, programId } });
  sendData(res, { cohort }, 201);
}

export async function update(
  req: Request<{ programId: string; id: string }, unknown, UpdateCohortInput>,
  res: Response,
) {
  const programId = Number(req.params.programId);
  const id = Number(req.params.id);
  await findOwnedProgram(req.user!.institutionId, programId);
  const cohort = await prisma.cohort.findFirst({ where: { id, programId } });
  if (!cohort) throw ApiError.notFound("Cohort not found");
  const updated = await prisma.cohort.update({ where: { id }, data: req.body });
  sendData(res, { cohort: updated });
}

export async function remove(req: Request, res: Response) {
  const programId = Number(req.params.programId);
  const id = Number(req.params.id);
  await findOwnedProgram(req.user!.institutionId, programId);
  const cohort = await prisma.cohort.findFirst({ where: { id, programId } });
  if (!cohort) throw ApiError.notFound("Cohort not found");
  await prisma.cohort.delete({ where: { id } });
  sendData(res, { deleted: true });
}
