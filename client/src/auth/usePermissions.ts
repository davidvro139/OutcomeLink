import {
  ADMIN_ROLES,
  EMPLOYER_MANAGER_ROLES,
  OPERATIONAL_ROLES,
  STUDENT_MANAGER_ROLES,
  hasRole,
  type Role,
} from "@outcomelink/shared";
import { useAuth } from "./AuthContext";

export interface Permissions {
  /** Any operational write (follow-ups, licensure, outcomes, surveys, evidence, saved reports…) — everyone but the Auditor. */
  canWrite: boolean;
  /** Create/edit students and enrollments, merge duplicates, run imports. */
  canManageStudents: boolean;
  /** Create/edit employers and their contacts. */
  canManageEmployers: boolean;
  /** Institution-wide administration (reporting-period lifecycle, validation resolve, users…). */
  canAdminister: boolean;
  /** Programs, campuses and departments are System-Administrator-only. */
  canManagePrograms: boolean;
}

export function permissionsFor(role: Role | undefined): Permissions {
  return {
    canWrite: hasRole(role, OPERATIONAL_ROLES),
    canManageStudents: hasRole(role, STUDENT_MANAGER_ROLES),
    canManageEmployers: hasRole(role, EMPLOYER_MANAGER_ROLES),
    canAdminister: hasRole(role, ADMIN_ROLES),
    canManagePrograms: role === "SYSTEM_ADMINISTRATOR",
  };
}

/**
 * Which write controls the current role may see. The sets come from
 * @outcomelink/shared — the same ones the server's route guards use — so a
 * control is hidden exactly when the server would reject it, instead of
 * showing a button that only fails with "Insufficient role" once clicked.
 */
export function usePermissions(): Permissions {
  return permissionsFor(useAuth().user?.role);
}
