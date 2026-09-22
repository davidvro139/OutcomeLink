import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const setProgramFollowUpOwnerSchema = z.object({
  staffUserId: z.coerce.number().int().positive(),
});
type SetProgramFollowUpOwnerInput = z.infer<typeof setProgramFollowUpOwnerSchema>;

async function findOwnedProgram(institutionId: number, programId: number) {
  // SYSTEM_ADMINISTRATOR/INSTITUTIONAL_ADMINISTRATOR-only route (see
  // programs.routes.ts) — neither is a program-scoped role, so no
  // accessScope lookup is needed, same reasoning as negotiatedBenchmarks.ts.
  const program = await prisma.program.findFirst({ where: { id: programId, institutionId } });
  if (!program) throw ApiError.notFound("Program not found");
  return program;
}

export async function show(req: Request, res: Response) {
  const programId = Number(req.params.programId);
  await findOwnedProgram(req.user!.institutionId, programId);
  const owner = await prisma.programFollowUpOwner.findUnique({
    where: { programId },
    include: { staffUser: { select: { id: true, name: true } } },
  });
  sendData(res, { owner });
}

export async function set(
  req: Request<{ programId: string }, unknown, SetProgramFollowUpOwnerInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const programId = Number(req.params.programId);
  await findOwnedProgram(institutionId, programId);

  const staffUser = await prisma.user.findFirst({
    where: { id: req.body.staffUserId, institutionId, active: true },
  });
  if (!staffUser) throw ApiError.badRequest("Unknown staffUserId");

  const owner = await prisma.programFollowUpOwner.upsert({
    where: { programId },
    create: { institutionId, programId, staffUserId: req.body.staffUserId },
    update: { staffUserId: req.body.staffUserId },
    include: { staffUser: { select: { id: true, name: true } } },
  });
  sendData(res, { owner });
}

export async function remove(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const programId = Number(req.params.programId);
  await findOwnedProgram(institutionId, programId);
  await prisma.programFollowUpOwner.deleteMany({ where: { programId } });
  sendData(res, { deleted: true });
}
