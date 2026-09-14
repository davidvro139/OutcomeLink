import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as attempts from "./followUpAttempts";
import * as queueModule from "./queue";

// Every role except Read-Only/Auditor may record a follow-up attempt (spec §4).
const CAN_RECORD_FOLLOWUPS = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
  "CAREER_SERVICES_STAFF",
  "INSTRUCTOR_STAFF",
] as const;

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
  requireRole(...CAN_RECORD_FOLLOWUPS),
  validate(attempts.createFollowUpAttemptSchema),
  asyncHandler(attempts.create),
);
