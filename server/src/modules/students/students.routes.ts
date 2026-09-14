import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as communicationPreference from "./communicationPreference";
import * as enrollments from "./enrollments";
import * as merge from "./merge";
import * as students from "./students";

const CAN_MANAGE_STUDENTS = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
] as const;

export const studentsRouter = Router();

studentsRouter.get(
  "/",
  requireAuth,
  validate(students.listStudentsQuerySchema, "query"),
  asyncHandler(students.list),
);
studentsRouter.get("/:id", requireAuth, asyncHandler(students.show));
studentsRouter.post(
  "/",
  requireAuth,
  requireRole(...CAN_MANAGE_STUDENTS),
  validate(students.createStudentSchema),
  asyncHandler(students.create),
);
studentsRouter.patch(
  "/:id",
  requireAuth,
  requireRole(...CAN_MANAGE_STUDENTS),
  validate(students.updateStudentSchema),
  asyncHandler(students.update),
);

studentsRouter.get(
  "/:studentId/communication-preference",
  requireAuth,
  asyncHandler(communicationPreference.show),
);
studentsRouter.put(
  "/:studentId/communication-preference",
  requireAuth,
  requireRole(...CAN_MANAGE_STUDENTS, "INSTRUCTOR_STAFF", "CAREER_SERVICES_STAFF"),
  validate(communicationPreference.upsertCommunicationPreferenceSchema),
  asyncHandler(communicationPreference.upsert),
);

studentsRouter.get("/:studentId/enrollments", requireAuth, asyncHandler(enrollments.list));
studentsRouter.post(
  "/:studentId/enrollments",
  requireAuth,
  requireRole(...CAN_MANAGE_STUDENTS),
  validate(enrollments.createEnrollmentSchema),
  asyncHandler(enrollments.create),
);
studentsRouter.patch(
  "/:studentId/enrollments/:id",
  requireAuth,
  requireRole(...CAN_MANAGE_STUDENTS),
  validate(enrollments.updateEnrollmentSchema),
  asyncHandler(enrollments.update),
);

studentsRouter.post(
  "/:id/merge",
  requireAuth,
  requireRole(...CAN_MANAGE_STUDENTS),
  validate(merge.mergeStudentsSchema),
  asyncHandler(merge.merge),
);
