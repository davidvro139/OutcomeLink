import type { Request, Response } from "express";
import { FOLLOW_UP_OUTCOMES } from "@outcomelink/shared";
import { z } from "zod";
import { getAccessibleProgramIds } from "../../lib/accessScope";
import { sendPaginated, toPagination } from "../../lib/apiResponse";
import { paginationQuerySchema } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";

/**
 * Follow-Up Queue (spec §12). "Assigned To" prefers Student.assignedStaffUserId
 * — the real ownership field added for Advanced Workflow Automation (Phase 3,
 * docs/TODO.md) — falling back to whoever logged the most recent follow-up
 * attempt for students that predate real assignment ever being set. The
 * "Reporting period" filter from the spec is deferred until the outcomes/
 * accreditation modules (a later stage) give us something to filter by.
 *
 * Known limitation: `minDaysOverdue` and `minAttempts` are applied in
 * application code after the page is fetched (computing "days overdue"
 * requires comparing against "now", and MySQL date arithmetic for that is
 * more naturally done here), so a page can legitimately return fewer than
 * `pageSize` rows when those filters are active. Acceptable for a first
 * pass; revisit with a raw aggregate query if this becomes a real problem
 * at demo-data scale.
 */
export const followUpQueueQuerySchema = paginationQuerySchema.extend({
  programId: z.coerce.number().int().positive().optional(),
  campusId: z.coerce.number().int().positive().optional(),
  staffUserId: z.coerce.number().int().positive().optional(),
  outcomeStatus: z.enum(FOLLOW_UP_OUTCOMES).optional(),
  minAttempts: z.coerce.number().int().nonnegative().optional(),
  minDaysOverdue: z.coerce.number().int().nonnegative().optional(),
});
type FollowUpQueueQuery = z.infer<typeof followUpQueueQuerySchema>;

export async function queue(req: Request, res: Response) {
  const {
    page,
    pageSize,
    programId,
    campusId,
    staffUserId,
    outcomeStatus,
    minAttempts,
    minDaysOverdue,
  } = req.query as unknown as FollowUpQueueQuery;
  const institutionId = req.user!.institutionId;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  // Combined via AND on the same `enrollments.some` check rather than two
  // separate top-level `enrollments` keys (which would collide — the second
  // would silently replace the first, e.g. dropping a `?programId=` filter
  // and effectively removing the access-scope check).
  const enrollmentConditions = [
    ...(programId || campusId ? [{ programId, campusId }] : []),
    ...(accessibleProgramIds ? [{ programId: { in: accessibleProgramIds } }] : []),
  ];

  const students = await prisma.student.findMany({
    where: {
      institutionId,
      ...(enrollmentConditions.length > 0 && { enrollments: { some: { AND: enrollmentConditions } } }),
      ...(staffUserId && {
        OR: [{ assignedStaffUserId: staffUserId }, { followUpAttempts: { some: { staffUserId } } }],
      }),
    },
    include: {
      enrollments: {
        where: { programId, campusId },
        take: 1,
        orderBy: { startDate: "desc" },
        include: {
          program: { select: { id: true, name: true } },
          campus: { select: { id: true, name: true } },
        },
      },
      followUpAttempts: {
        orderBy: { attemptedAt: "desc" },
        take: 1,
        include: { staffUser: { select: { id: true, name: true } } },
      },
      assignedStaffUser: { select: { id: true, name: true } },
      _count: { select: { followUpAttempts: true } },
    },
    orderBy: [{ lastName: "asc" }, { id: "asc" }],
  });

  const now = Date.now();
  const rows = students
    .map((student) => {
      const latest = student.followUpAttempts[0];
      const daysOverdue = latest?.nextFollowUpDate
        ? Math.max(0, Math.floor((now - latest.nextFollowUpDate.getTime()) / (24 * 60 * 60 * 1000)))
        : 0;

      return {
        student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
        program: student.enrollments[0]?.program ?? null,
        campus: student.enrollments[0]?.campus ?? null,
        attempts: student._count.followUpAttempts,
        lastContact: latest?.attemptedAt ?? null,
        lastOutcome: latest?.outcome ?? null,
        nextFollowUpDate: latest?.nextFollowUpDate ?? null,
        assignedTo: student.assignedStaffUser ?? latest?.staffUser ?? null,
        daysOverdue,
      };
    })
    .filter((row) => (outcomeStatus ? row.lastOutcome === outcomeStatus : true))
    .filter((row) => (minAttempts !== undefined ? row.attempts >= minAttempts : true))
    .filter((row) => (minDaysOverdue !== undefined ? row.daysOverdue >= minDaysOverdue : true));

  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  sendPaginated(res, pageRows, toPagination(page, pageSize, rows.length));
}
