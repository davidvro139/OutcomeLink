import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as placements from "./placements";

const CAN_MANAGE_PLACEMENTS = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
  "CAREER_SERVICES_STAFF",
  "INSTRUCTOR_STAFF",
] as const;

export const placementsRouter = Router();

placementsRouter.get("/:studentId/employment", requireAuth, asyncHandler(placements.list));
placementsRouter.post(
  "/:studentId/employment",
  requireAuth,
  requireRole(...CAN_MANAGE_PLACEMENTS),
  validate(placements.createEmploymentRecordSchema),
  asyncHandler(placements.create),
);
placementsRouter.patch(
  "/:studentId/employment/:id",
  requireAuth,
  requireRole(...CAN_MANAGE_PLACEMENTS),
  validate(placements.updateEmploymentRecordSchema),
  asyncHandler(placements.update),
);
