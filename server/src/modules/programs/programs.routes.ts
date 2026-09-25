import { ADMIN_ROLES } from "@outcomelink/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { negotiatedBenchmarks } from "../accreditation/benchmarks";
import * as followUpOwners from "../followups/programFollowUpOwners";
import * as campuses from "./campuses";
import * as cohorts from "./cohorts";
import * as departments from "./departments";
import * as institution from "./institution";
import * as programs from "./programs";

const SYSTEM_ADMIN = "SYSTEM_ADMINISTRATOR" as const;
<<<<<<< HEAD
const CAN_MANAGE_FOLLOW_UP_OWNERS = [SYSTEM_ADMIN, "INSTITUTIONAL_ADMINISTRATOR"] as const;
=======
const CAN_MANAGE_FOLLOW_UP_OWNERS = ADMIN_ROLES;
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

export const programsRouter = Router();

// Institution (single row per deployment — see docs/DATA_MODEL.md §13)
programsRouter.get("/institution", requireAuth, asyncHandler(institution.show));
programsRouter.patch(
  "/institution",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(institution.updateInstitutionSchema),
  asyncHandler(institution.update),
);

// Campuses
programsRouter.get(
  "/campuses",
  requireAuth,
  validate(campuses.listCampusesQuerySchema, "query"),
  asyncHandler(campuses.list),
);
programsRouter.get("/campuses/:id", requireAuth, asyncHandler(campuses.show));
programsRouter.post(
  "/campuses",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(campuses.createCampusSchema),
  asyncHandler(campuses.create),
);
programsRouter.patch(
  "/campuses/:id",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(campuses.updateCampusSchema),
  asyncHandler(campuses.update),
);
programsRouter.delete(
  "/campuses/:id",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  asyncHandler(campuses.remove),
);

// Departments
programsRouter.get(
  "/departments",
  requireAuth,
  validate(departments.listDepartmentsQuerySchema, "query"),
  asyncHandler(departments.list),
);
programsRouter.get("/departments/:id", requireAuth, asyncHandler(departments.show));
programsRouter.post(
  "/departments",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(departments.createDepartmentSchema),
  asyncHandler(departments.create),
);
programsRouter.patch(
  "/departments/:id",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(departments.updateDepartmentSchema),
  asyncHandler(departments.update),
);
programsRouter.delete(
  "/departments/:id",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  asyncHandler(departments.remove),
);

// Programs
programsRouter.get(
  "/programs",
  requireAuth,
  validate(programs.listProgramsQuerySchema, "query"),
  asyncHandler(programs.list),
);
programsRouter.get("/programs/:id", requireAuth, asyncHandler(programs.show));
programsRouter.post(
  "/programs",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(programs.createProgramSchema),
  asyncHandler(programs.create),
);
programsRouter.patch(
  "/programs/:id",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(programs.updateProgramSchema),
  asyncHandler(programs.update),
);
programsRouter.delete(
  "/programs/:id",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  asyncHandler(programs.remove),
);

// Cohorts (nested under a program)
programsRouter.get("/programs/:programId/cohorts", requireAuth, asyncHandler(cohorts.list));
programsRouter.post(
  "/programs/:programId/cohorts",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(cohorts.createCohortSchema),
  asyncHandler(cohorts.create),
);
programsRouter.patch(
  "/programs/:programId/cohorts/:id",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(cohorts.updateCohortSchema),
  asyncHandler(cohorts.update),
);
programsRouter.delete(
  "/programs/:programId/cohorts/:id",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  asyncHandler(cohorts.remove),
);

// Negotiated benchmarks (nested under a program) — Commission-approved
// alternate rates, per docs/COE_RULE_MATRIX.md's negotiated-rate note.
programsRouter.get(
  "/programs/:programId/negotiated-benchmarks",
  requireAuth,
  asyncHandler(negotiatedBenchmarks.list),
);
programsRouter.post(
  "/programs/:programId/negotiated-benchmarks",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(negotiatedBenchmarks.createNegotiatedBenchmarkSchema),
  asyncHandler(negotiatedBenchmarks.create),
);

// Follow-up owner (nested under a program) — Advanced Workflow Automation
// (Phase 3, docs/TODO.md): the one staff member auto-assignment hands new
// follow-up work to for this program.
programsRouter.get(
  "/programs/:programId/follow-up-owner",
  requireAuth,
  requireRole(...CAN_MANAGE_FOLLOW_UP_OWNERS),
  asyncHandler(followUpOwners.show),
);
programsRouter.put(
  "/programs/:programId/follow-up-owner",
  requireAuth,
  requireRole(...CAN_MANAGE_FOLLOW_UP_OWNERS),
  validate(followUpOwners.setProgramFollowUpOwnerSchema),
  asyncHandler(followUpOwners.set),
);
programsRouter.delete(
  "/programs/:programId/follow-up-owner",
  requireAuth,
  requireRole(...CAN_MANAGE_FOLLOW_UP_OWNERS),
  asyncHandler(followUpOwners.remove),
);
