import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as attempts from "./followUpAttempts";
import * as queueModule from "./queue";

export const followupsRouter = Router();

followupsRouter.get(
  "/queue",
  requireAuth,
  validate(queueModule.followUpQueueQuerySchema, "query"),
  asyncHandler(queueModule.queue),
);

followupsRouter.get("/students/:studentId/follow-ups", requireAuth, asyncHandler(attempts.list));
followupsRouter.post(
  "/students/:studentId/follow-ups",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(attempts.createFollowUpAttemptSchema),
  asyncHandler(attempts.create),
);
