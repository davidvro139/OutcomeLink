import { OPERATIONAL_ROLES, ROLES, type Role } from "@outcomelink/shared";
import { describe, expect, it } from "vitest";
import { permissionsFor } from "./usePermissions";

const MATRIX: Record<Role, Record<string, boolean>> = {
  SYSTEM_ADMINISTRATOR: {
    canWrite: true,
    canManageStudents: true,
    canManageEmployers: true,
    canAdminister: true,
    canManagePrograms: true,
  },
  INSTITUTIONAL_ADMINISTRATOR: {
    canWrite: true,
    canManageStudents: true,
    canManageEmployers: true,
    canAdminister: true,
    canManagePrograms: false,
  },
  PROGRAM_ADMINISTRATOR: {
    canWrite: true,
    canManageStudents: true,
    canManageEmployers: false,
    canAdminister: false,
    canManagePrograms: false,
  },
  CAREER_SERVICES_STAFF: {
    canWrite: true,
    canManageStudents: false,
    canManageEmployers: true,
    canAdminister: false,
    canManagePrograms: false,
  },
  INSTRUCTOR_STAFF: {
    canWrite: true,
    canManageStudents: false,
    canManageEmployers: false,
    canAdminister: false,
    canManagePrograms: false,
  },
  READ_ONLY_AUDITOR: {
    canWrite: false,
    canManageStudents: false,
    canManageEmployers: false,
    canAdminister: false,
    canManagePrograms: false,
  },
};

describe("permissionsFor", () => {
  it.each(ROLES)("grants %s exactly its documented capabilities", (role) => {
    expect(permissionsFor(role)).toEqual(MATRIX[role]);
  });

  it("grants nothing when there is no user", () => {
    expect(Object.values(permissionsFor(undefined)).every((v) => v === false)).toBe(true);
  });

  it("the Read-Only/Auditor is the only role excluded from operational writes", () => {
    expect(ROLES.filter((r) => !OPERATIONAL_ROLES.includes(r))).toEqual(["READ_ONLY_AUDITOR"]);
  });
});
