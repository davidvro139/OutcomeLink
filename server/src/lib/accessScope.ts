import type { Prisma } from "@prisma/client";
import type { Role } from "@outcomelink/shared";
import { ApiError } from "./apiError";
import { prisma } from "./prisma";

/**
 * Roles restricted to their assigned programs (project review, 2026-09-18:
 * "enforce program/campus access throughout the API"). Per spec §4, Program
 * Administrator is explicitly "assigned programs"; Career Services and
 * Instructor/Staff are explicitly institution-wide ("across all programs")
 * or left institution-wide by product decision; Read-Only/Auditor is scoped
 * too, by the same explicit decision, reusing the identical mechanism —
 * an auditor's job is to review a bounded set of records, not necessarily
 * the whole institution's.
 *
 * `getAccessibleProgramIds()` is the single source of truth every scoped
 * route/query filters through, so a list, a detail route, a report, and an
 * export can never disagree about which programs a given user can see.
 */
export const PROGRAM_SCOPED_ROLES: readonly Role[] = ["PROGRAM_ADMINISTRATOR", "READ_ONLY_AUDITOR"];

export function isProgramScoped(role: Role): boolean {
  return PROGRAM_SCOPED_ROLES.includes(role);
}

/**
 * Returns the program ids this user may see, or `null` for an unrestricted
 * (non-scoped-role) user — callers must treat `null` as "no filter," not as
 * an empty/deny-all set. A scoped user's accessible set is the union of
 * direct UserProgramAccess grants and every program at any UserCampusAccess-
 * granted campus (either grant mechanism works for either scoped role,
 * matching how prisma/seed.ts already seeds both across different roles) —
 * a scoped user with no grants at all sees nothing, which is the correct,
 * fail-closed default until an admin assigns them something.
 */
export async function getAccessibleProgramIds(user: {
  sub: number;
  role: Role;
  institutionId: number;
}): Promise<number[] | null> {
  if (!isProgramScoped(user.role)) return null;

  const [direct, viaCampus] = await Promise.all([
    prisma.userProgramAccess.findMany({
      where: { userId: user.sub },
      select: { programId: true },
    }),
    prisma.userCampusAccess.findMany({
      where: { userId: user.sub },
      select: { campus: { select: { programs: { select: { id: true } } } } },
    }),
  ]);

  const ids = new Set<number>();
  for (const grant of direct) ids.add(grant.programId);
  for (const grant of viaCampus) for (const program of grant.campus.programs) ids.add(program.id);
  return [...ids];
}

/**
 * A `Student` has no `programId` of its own — scoping is via "has at least
 * one enrollment in an accessible program." Reused everywhere a student is
 * looked up by id (students.ts and the eight other modules that each used to
 * carry their own copy-pasted, institution-only `findOwnedStudent`: outcomes,
 * placements, follow-ups, licensure, both survey types, communication
 * preference, and the communication timeline) so program scoping can't be
 * accidentally applied to some of a student's sub-resources but not others.
 */
export function studentProgramScopeFilter(accessibleProgramIds: number[] | null): Prisma.StudentWhereInput {
  return accessibleProgramIds ? { enrollments: { some: { programId: { in: accessibleProgramIds } } } } : {};
}

/**
 * Guards any caller-supplied `programId` on a mutation (enrollments, licensure
 * results) — without this, a scoped user could otherwise reach an
 * already-accessible student and then enroll/record them against a program
 * outside their own assignment, escalating scope one write at a time. Not
 * folded into a `where` filter, since these are single-value equality checks
 * on a body field, not a list query.
 */
export function assertProgramAccessible(
  programId: number | undefined,
  accessibleProgramIds: number[] | null,
): void {
  if (programId !== undefined && accessibleProgramIds && !accessibleProgramIds.includes(programId)) {
    throw ApiError.notFound("Program not found");
  }
}

/**
 * The reverse direction of getAccessibleProgramIds() — given a program,
 * which users should hear about it — for Advanced Workflow Automation's
 * (Phase 3, docs/TODO.md) escalation and validation-issue notifications.
 * Prefers Program Administrators with access (direct or via campus) to this
 * specific program; falls back to institution-wide administrators if none
 * are configured, so a program nobody's been explicitly assigned to still
 * has someone to notify rather than silently notifying no one.
 */
export async function getProgramNotificationRecipients(
  programId: number,
  institutionId: number,
): Promise<{ id: number }[]> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { campusId: true },
  });
  if (!program) return [];

  const programAdmins = await prisma.user.findMany({
    where: {
      institutionId,
      role: "PROGRAM_ADMINISTRATOR",
      active: true,
      OR: [
        { programAccess: { some: { programId } } },
        { campusAccess: { some: { campusId: program.campusId } } },
      ],
    },
    select: { id: true },
  });
  if (programAdmins.length > 0) return programAdmins;

  return prisma.user.findMany({
    where: { institutionId, role: { in: ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"] }, active: true },
    select: { id: true },
  });
}
