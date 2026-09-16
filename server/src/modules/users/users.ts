import type { Request, Response } from "express";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

/**
 * Minimal institution staff directory — currently exists only to populate
 * "assign to" pickers (e.g. an Improvement Plan's responsible user). No
 * dedicated user-management UI reads this yet; that's its own, larger,
 * not-yet-scheduled feature (user administration isn't in spec §63/§64).
 */
export async function list(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    where: { institutionId: req.user!.institutionId, active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  sendData(res, { users });
}
