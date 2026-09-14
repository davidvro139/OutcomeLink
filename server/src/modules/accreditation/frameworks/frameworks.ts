import type { Request, Response } from "express";
import { z } from "zod";
import { sendData } from "../../../lib/apiResponse";
import { prisma } from "../../../lib/prisma";

export const createFrameworkSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
});
type CreateFrameworkInput = z.infer<typeof createFrameworkSchema>;

export async function list(_req: Request, res: Response) {
  const frameworks = await prisma.accreditationFramework.findMany({ orderBy: { name: "asc" } });
  sendData(res, { frameworks });
}

export async function create(req: Request<unknown, unknown, CreateFrameworkInput>, res: Response) {
  const framework = await prisma.accreditationFramework.create({ data: req.body });
  sendData(res, { framework }, 201);
}
