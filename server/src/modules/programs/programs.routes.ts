import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as campuses from "./campuses";
import * as cohorts from "./cohorts";
import * as departments from "./departments";
import * as institution from "./institution";
import * as programs from "./programs";

const SYSTEM_ADMIN = "SYSTEM_ADMINISTRATOR" as const;

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
