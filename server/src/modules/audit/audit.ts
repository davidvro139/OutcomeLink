import type { Request, Response } from "express";
import { z } from "zod";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
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
 * Student and Program also check the caller's program scope (project
 * review, 2026-09-18) — an out-of-scope entity's audit trail is exactly the
 * kind of drill-down detail a scoped role shouldn't reach just because they
 * know or guess its id. Employer and ReportingPeriod stay institution-only,
 * same reasoning as everywhere else scoping was applied: neither is owned by
 * a single program.
 */
const OWNERSHIP_CHECKS: Record<
  string,
  (id: number, institutionId: number, accessibleProgramIds: number[] | null) => Promise<boolean>
> = {
  Student: async (id, institutionId, accessibleProgramIds) =>
    Boolean(
      await prisma.student.findFirst({ where: { id, institutionId, ...studentProgramScopeFilter(accessibleProgramIds) } }),
    ),
  Program: async (id, institutionId, accessibleProgramIds) =>
    (!accessibleProgramIds || accessibleProgramIds.includes(id)) &&
    Boolean(await prisma.program.findFirst({ where: { id, institutionId } })),
  Employer: async (id, institutionId) => Boolean(await prisma.employer.findFirst({ where: { id, institutionId } })),
  ReportingPeriod: async (id, institutionId) =>
    Boolean(await prisma.reportingPeriod.findFirst({ where: { id, institutionId } })),
};

export async function list(req: Request, res: Response) {
  const { entityType, entityId } = req.query as unknown as ListAuditQuery;
  const institutionId = req.user!.institutionId;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const check = OWNERSHIP_CHECKS[entityType];
  if (!check) throw ApiError.badRequest(`Audit history is not available for entity type "${entityType}"`);

  const owned = await check(entityId, institutionId, accessibleProgramIds);
  if (!owned) throw ApiError.notFound("Record not found");

  const entries = await prisma.auditLogEntry.findMany({
    where: { entityType, entityId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { occurredAt: "desc" },
  });
  sendData(res, { entries });
}
