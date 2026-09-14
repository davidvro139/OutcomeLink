import type { Role } from "@outcomelink/shared";

/** Every role except Read-Only/Auditor (spec §4: "Cannot modify data"). */
export const OPERATIONAL_ROLES: readonly Role[] = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
  "CAREER_SERVICES_STAFF",
  "INSTRUCTOR_STAFF",
];
