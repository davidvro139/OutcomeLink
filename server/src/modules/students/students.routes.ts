import { STUDENT_MANAGER_ROLES } from "@outcomelink/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as communicationPreference from "./communicationPreference";
import * as communicationTimeline from "./communicationTimeline";
<<<<<<< HEAD
import * as demographics from "./demographics";
=======
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import * as enrollments from "./enrollments";
import * as merge from "./merge";
import * as students from "./students";

const CAN_MANAGE_STUDENTS = STUDENT_MANAGER_ROLES;

export const studentsRouter = Router();

studentsRouter.get(
  "/",
  requireAuth,
  validate(students.listStudentsQuerySchema, "query"),
  asyncHandler(students.list),
);
// Registered before "/:id" so "export" isn't swallowed as an :id value.
studentsRouter.get(
  "/export",
  requireAuth,
  validate(students.listStudentsQuerySchema, "query"),
  asyncHandler(students.exportStudents),
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

studentsRouter.get(
  "/:studentId/communication-timeline",
  requireAuth,
  asyncHandler(communicationTimeline.list),
);

<<<<<<< HEAD
studentsRouter.get(
  "/:studentId/demographics",
  requireAuth,
  asyncHandler(demographics.show),
);
studentsRouter.put(
  "/:studentId/demographics",
  requireAuth,
  requireRole(...CAN_MANAGE_STUDENTS),
  validate(demographics.upsertStudentDemographicsSchema),
  asyncHandler(demographics.upsert),
);

=======
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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

studentsRouter.get(
  "/:id/duplicate-candidates",
  requireAuth,
  asyncHandler(merge.duplicateCandidates),
);
studentsRouter.post(
  "/:id/merge",
  requireAuth,
  requireRole(...CAN_MANAGE_STUDENTS),
  validate(merge.mergeStudentsSchema),
  asyncHandler(merge.merge),
);
