import type { Request, Response } from "express";
import { z } from "zod";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { ACTIVE_REPORTING_PERIOD_STATUSES } from "../../lib/reportingPeriods";
import { getUnresolvedOutcomeStudentIds } from "../reports/reports";

export const assignFollowUpSchema = z.object({
  staffUserId: z.coerce.number().int().positive().nullable(),
});
type AssignFollowUpInput = z.infer<typeof assignFollowUpSchema>;

export const bulkAssignFollowUpSchema = assignFollowUpSchema.extend({
  studentIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
});
type BulkAssignFollowUpInput = z.infer<typeof bulkAssignFollowUpSchema>;

async function assertStaffUserValid(institutionId: number, staffUserId: number | null) {
  if (staffUserId === null) return;
  const staffUser = await prisma.user.findFirst({ where: { id: staffUserId, institutionId, active: true } });
  if (!staffUser) throw ApiError.badRequest("Unknown staffUserId");
}

export async function assign(
  req: Request<{ studentId: string }, unknown, AssignFollowUpInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const studentId = Number(req.params.studentId);
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId, ...studentProgramScopeFilter(accessibleProgramIds) },
  });
  if (!student) throw ApiError.notFound("Student not found");

  await assertStaffUserValid(institutionId, req.body.staffUserId);
  const updated = await prisma.student.update({
    where: { id: studentId },
    data: { assignedStaffUserId: req.body.staffUserId },
    include: { assignedStaffUser: { select: { id: true, name: true } } },
  });
  sendData(res, { student: updated });
}

/**
 * Same partial-success shape as followUpAttempts.ts's bulkCreate — a student
 * outside the caller's institution/access scope is skipped with a reason
 * rather than failing the whole batch.
 */
export async function bulkAssign(
  req: Request<Record<string, never>, unknown, BulkAssignFollowUpInput>,
  res: Response,
) {
  const { studentIds, staffUserId } = req.body;
  const institutionId = req.user!.institutionId;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);
  await assertStaffUserValid(institutionId, staffUserId);

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, institutionId, ...studentProgramScopeFilter(accessibleProgramIds) },
    select: { id: true },
  });
  const eligibleIds = new Set(students.map((s) => s.id));
  const skipped = studentIds
    .filter((id) => !eligibleIds.has(id))
    .map((studentId) => ({ studentId, reason: "Student not found" }));

  const result = await prisma.student.updateMany({
    where: { id: { in: [...eligibleIds] } },
    data: { assignedStaffUserId: staffUserId },
  });
  sendData(res, { assignedCount: result.count, skipped }, 200);
}

/**
 * Advanced Workflow Automation (Phase 3, docs/TODO.md): auto-assigns
 * follow-up ownership by program. Reuses getUnresolvedOutcomeStudentIds()
 * — the same "needs follow-up" population already shared by P8's Unknown
 * Outcomes report, the missing-outcomes digest, and the graduate outreach
 * campaign — across every active reporting period at every institution, so
 * this can never disagree with what staff already see elsewhere. Only
 * touches students with no assignment yet (never overwrites a manual or
 * prior auto- assignment) and only when that program has a configured
 * ProgramFollowUpOwner (no owner configured = left alone, same as today).
 * A student's program is attributed via their most-recently-completed
 * enrollment — the same rule Skills-Gap Analysis already uses for the same
 * "which one program does this population-membership belong to" question.
 * Sends one digest-style FOLLOW_UP_DUE notification per owner, not one per
 * student, same anti-spam shape the missing-outcomes digest established.
 */
export async function runFollowUpAutoAssignment(): Promise<{ assignedCount: number; ownersNotified: number }> {
  const institutions = await prisma.institution.findMany({ select: { id: true } });

  let assignedCount = 0;
  let ownersNotified = 0;

  for (const institution of institutions) {
    const periods = await prisma.reportingPeriod.findMany({
      where: { institutionId: institution.id, status: { in: [...ACTIVE_REPORTING_PERIOD_STATUSES] } },
      select: { id: true },
    });
    if (periods.length === 0) continue;

    const unresolvedIds = new Set<number>();
    for (const period of periods) {
      for (const id of await getUnresolvedOutcomeStudentIds(institution.id, period.id)) unresolvedIds.add(id);
    }
    if (unresolvedIds.size === 0) continue;

    const candidates = await prisma.student.findMany({
      where: { id: { in: [...unresolvedIds] }, assignedStaffUserId: null },
      include: {
        enrollments: {
          where: { actualCompletionDate: { not: null } },
          orderBy: { actualCompletionDate: "desc" },
          take: 1,
          select: { programId: true },
        },
      },
    });
    if (candidates.length === 0) continue;

    const programIds = new Set(
      candidates.flatMap((c) => (c.enrollments[0] ? [c.enrollments[0].programId] : [])),
    );
    const owners = await prisma.programFollowUpOwner.findMany({
      where: { programId: { in: [...programIds] } },
    });
    const ownerByProgramId = new Map(owners.map((o) => [o.programId, o.staffUserId]));

    const newlyAssignedByOwner = new Map<number, number>();
    for (const candidate of candidates) {
      const programId = candidate.enrollments[0]?.programId;
      const staffUserId = programId ? ownerByProgramId.get(programId) : undefined;
      if (!staffUserId) continue;

      await prisma.student.update({
        where: { id: candidate.id },
        data: { assignedStaffUserId: staffUserId },
      });
      assignedCount++;
      newlyAssignedByOwner.set(staffUserId, (newlyAssignedByOwner.get(staffUserId) ?? 0) + 1);
    }

    for (const [staffUserId, count] of newlyAssignedByOwner) {
      // No single record to point at — this is a digest across possibly
      // several programs/periods, same reasoning as the missing-outcomes
      // digest pointing at a whole ReportingPeriod rather than one student.
      // Unlike that digest, there isn't even one period in common here, so
      // referenceEntityType/Id are left unset; the Follow-Up Queue itself is
      // where the assignment actually shows up.
      await createNotification({
        userId: staffUserId,
        type: "FOLLOW_UP_DUE",
        message: `${count} student${count === 1 ? "" : "s"} auto-assigned to you for follow-up.`,
      });
      ownersNotified++;
    }
  }

  return { assignedCount, ownersNotified };
}
