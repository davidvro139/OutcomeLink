import type { Request, Response } from "express";
import { FOLLOW_UP_OUTCOMES } from "@outcomelink/shared";
import { z } from "zod";
import { getAccessibleProgramIds } from "../../lib/accessScope";
import { sendPaginated, toPagination } from "../../lib/apiResponse";
import { paginationQuerySchema } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";
import { ACTIVE_REPORTING_PERIOD_STATUSES } from "../../lib/reportingPeriods";
import { getUnresolvedOutcomeStudentIds } from "../reports/reports";

/**
 * Follow-Up Queue (spec §12). "Assigned To" prefers Student.assignedStaffUserId
 * — the real ownership field added for Advanced Workflow Automation (Phase 3,
 * docs/TODO.md) — falling back to whoever logged the most recent follow-up
 * attempt for students that predate real assignment ever being set.
 * `needsOutcome=true` limits the list to graduates in an active reporting
 * period with no resolved outcome — the same population as
 * getUnresolvedOutcomeStudentIds, including people already assigned. The
 * morning auto-assign job still touches only the unassigned subset. Omit
 * the flag and the queue stays every accessible student.
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
  needsOutcome: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  sort: z.enum(["firstName", "lastName", "programName", "attemptedAt"]).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
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
    needsOutcome,
    sort,
    order,
  } = req.query as unknown as FollowUpQueueQuery;
  const institutionId = req.user!.institutionId;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  // Union across every active period. An empty set is an empty page: the
  // worklist must not fall back to every student when nobody needs an outcome.
  let unresolvedStudentIds: number[] | undefined;
  if (needsOutcome) {
    const periods = await prisma.reportingPeriod.findMany({
      where: { institutionId, status: { in: [...ACTIVE_REPORTING_PERIOD_STATUSES] } },
      select: { id: true },
    });
    const ids = new Set<number>();
    for (const period of periods) {
      for (const id of await getUnresolvedOutcomeStudentIds(institutionId, period.id)) ids.add(id);
    }
    if (ids.size === 0) {
      sendPaginated(res, [], toPagination(page, pageSize, 0));
      return;
    }
    unresolvedStudentIds = [...ids];
  }

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
      ...(unresolvedStudentIds && { id: { in: unresolvedStudentIds } }),
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
        programName: student.enrollments[0]?.program?.name ?? "",
        attemptedAt: latest?.attemptedAt ?? new Date(0),
      };
    })
    .filter((row) => (outcomeStatus ? row.lastOutcome === outcomeStatus : true))
    .filter((row) => (minAttempts !== undefined ? row.attempts >= minAttempts : true))
    .filter((row) => (minDaysOverdue !== undefined ? row.daysOverdue >= minDaysOverdue : true));

  // Apply sorting
  if (sort) {
    rows.sort((a, b) => {
      let aVal: string | number | Date | null = null;
      let bVal: string | number | Date | null = null;

      if (sort === "firstName") {
        aVal = a.student.firstName;
        bVal = b.student.firstName;
      } else if (sort === "lastName") {
        aVal = a.student.lastName;
        bVal = b.student.lastName;
      } else if (sort === "programName") {
        aVal = a.programName;
        bVal = b.programName;
      } else if (sort === "attemptedAt") {
        aVal = a.attemptedAt;
        bVal = b.attemptedAt;
      }

      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      if (typeof aVal === "string" && typeof bVal === "string") {
        return order === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (aVal instanceof Date && bVal instanceof Date) {
        return order === "asc" ? aVal.getTime() - bVal.getTime() : bVal.getTime() - aVal.getTime();
      }

      return 0;
    });
  }

  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  sendPaginated(res, pageRows, toPagination(page, pageSize, rows.length));
}
