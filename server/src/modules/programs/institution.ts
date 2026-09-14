import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const updateInstitutionSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
type UpdateInstitutionInput = z.infer<typeof updateInstitutionSchema>;

export async function show(req: Request, res: Response) {
  const institution = await prisma.institution.findUnique({
    where: { id: req.user!.institutionId },
  });
  if (!institution) throw ApiError.notFound("Institution not found");
  sendData(res, { institution });
}

export async function update(
  req: Request<unknown, unknown, UpdateInstitutionInput>,
  res: Response,
) {
  const institution = await prisma.institution.update({
    where: { id: req.user!.institutionId },
    data: req.body,
  });
  sendData(res, { institution });
}
