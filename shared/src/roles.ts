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
