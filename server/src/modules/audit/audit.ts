import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const listAuditQuerySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.coerce.number().int().positive(),
});
type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

/**
 * AuditLogEntry has no institutionId of its own (it references arbitrary
 * entities by type+id), so ownership has to be checked per entity type.
 * Extend this map as more detail pages grow an audit history view.
 */
const OWNERSHIP_CHECKS: Record<string, (id: number, institutionId: number) => Promise<boolean>> = {
  Student: async (id, institutionId) => Boolean(await prisma.student.findFirst({ where: { id, institutionId } })),
  Program: async (id, institutionId) => Boolean(await prisma.program.findFirst({ where: { id, institutionId } })),
  Employer: async (id, institutionId) => Boolean(await prisma.employer.findFirst({ where: { id, institutionId } })),
  ReportingPeriod: async (id, institutionId) =>
    Boolean(await prisma.reportingPeriod.findFirst({ where: { id, institutionId } })),
};

export async function list(req: Request, res: Response) {
  const { entityType, entityId } = req.query as unknown as ListAuditQuery;
  const institutionId = req.user!.institutionId;

  const check = OWNERSHIP_CHECKS[entityType];
  if (!check) throw ApiError.badRequest(`Audit history is not available for entity type "${entityType}"`);

  const owned = await check(entityId, institutionId);
  if (!owned) throw ApiError.notFound("Record not found");

  const entries = await prisma.auditLogEntry.findMany({
    where: { entityType, entityId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { occurredAt: "desc" },
  });
  sendData(res, { entries });
}
