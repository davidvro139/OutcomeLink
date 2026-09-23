export const ROLES = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
  "CAREER_SERVICES_STAFF",
  "INSTRUCTOR_STAFF",
  "READ_ONLY_AUDITOR",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SYSTEM_ADMINISTRATOR: "System Administrator",
  INSTITUTIONAL_ADMINISTRATOR: "Institutional Administrator",
  PROGRAM_ADMINISTRATOR: "Program Administrator",
  CAREER_SERVICES_STAFF: "Career Services / Placement Staff",
  INSTRUCTOR_STAFF: "Instructor / Staff",
  READ_ONLY_AUDITOR: "Read-Only / Auditor",
};

/**
 * Role sets that gate writes, defined once so the server's route guards and
 * the client's "hide controls this role can't use" checks (client/src/auth/
 * usePermissions.ts) can never drift apart — the hand-copied local arrays
 * they replace were exactly how the UI ended up showing controls the server
 * would reject (docs/TODO.md, "Read-Only/Auditor sees fully-enabled write
 * controls").
 */

/** Every role except Read-Only/Auditor (spec §4: "Cannot modify data"). */
export const OPERATIONAL_ROLES: readonly Role[] = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
  "CAREER_SERVICES_STAFF",
  "INSTRUCTOR_STAFF",
];

/** Create/edit students and enrollments, merge duplicates, run bulk imports. */
export const STUDENT_MANAGER_ROLES: readonly Role[] = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
];

/** Create/edit employers and their contacts. */
export const EMPLOYER_MANAGER_ROLES: readonly Role[] = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "CAREER_SERVICES_STAFF",
];

/** Institution-wide administration: reporting-period lifecycle, users, connections, automation. */
export const ADMIN_ROLES: readonly Role[] = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

export function hasRole(role: Role | undefined, allowed: readonly Role[]): boolean {
  return role !== undefined && allowed.includes(role);
}
