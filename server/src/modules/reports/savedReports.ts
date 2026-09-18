import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { runReportSchema } from "./customReportBuilder";

/**
 * Saved report definitions are institution-wide, not restricted to their
 * creator — reports are usually meant to be shared with colleagues, the same
 * reasoning ImportMappingProfile already applies. `definition` is validated
 * against the current field/filter registry at save time (via
 * runReportSchema, the same schema `runCustomReport` validates against) so a
 * saved report can't reference a field that never existed, but it is NOT
 * re-validated here against what fields/filters are still valid for that
 * entity type — running it later goes through the same validation
 * `runCustomReport` always does, so a stale saved report just fails there
 * with a clear error instead of silently returning wrong data.
 */
export const saveReportSchema = z.object({
  name: z.string().trim().min(1).max(150),
  definition: runReportSchema,
});
type SaveReportInput = z.infer<typeof saveReportSchema>;

export async function list(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const savedReports = await prisma.savedReport.findMany({
    where: { institutionId },
    include: { creator: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  sendData(res, { savedReports });
}

export async function create(
  req: Request<Record<string, never>, unknown, SaveReportInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const { name, definition } = req.body;

  const savedReport = await prisma.savedReport.upsert({
    where: { institutionId_name: { institutionId, name } },
    create: { institutionId, createdBy: req.user!.sub, name, definition },
    update: { definition },
  });
  sendData(res, { savedReport }, 201);
}

export async function remove(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const id = Number(req.params.id);

  const existing = await prisma.savedReport.findFirst({ where: { id, institutionId } });
  if (!existing) throw ApiError.notFound("Saved report not found");

  await prisma.savedReport.delete({ where: { id } });
  sendData(res, { deleted: true });
}
