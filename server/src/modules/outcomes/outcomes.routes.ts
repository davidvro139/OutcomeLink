import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as outcomes from "./outcomes";

export const outcomesRouter = Router();

const BASE = "/students/:studentId/enrollments/:enrollmentId/outcomes";

outcomesRouter.get(BASE, requireAuth, asyncHandler(outcomes.list));
outcomesRouter.post(
  BASE,
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(outcomes.createOutcomeRecordSchema),
  asyncHandler(outcomes.create),
);
outcomesRouter.patch(
  `${BASE}/:id`,
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(outcomes.updateOutcomeRecordSchema),
  asyncHandler(outcomes.update),
);
