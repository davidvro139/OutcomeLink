import { ADMIN_ROLES } from "@outcomelink/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as assignment from "./assignment";
import * as automation from "./automationScheduler";
import * as attempts from "./followUpAttempts";
import * as queueModule from "./queue";

<<<<<<< HEAD
const CAN_MANAGE_AUTOMATION = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"] as const;
=======
const CAN_MANAGE_AUTOMATION = ADMIN_ROLES;
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

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
followupsRouter.post(
  "/bulk",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(attempts.bulkCreateFollowUpAttemptSchema),
  asyncHandler(attempts.bulkCreate),
);

followupsRouter.patch(
  "/:studentId/assign",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(assignment.assignFollowUpSchema),
  asyncHandler(assignment.assign),
);
followupsRouter.post(
  "/assign/bulk",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(assignment.bulkAssignFollowUpSchema),
  asyncHandler(assignment.bulkAssign),
);

// Advanced Workflow Automation (Phase 3, docs/TODO.md) — the same daily job
// the cron scheduler runs, exposed as a manual "Run Now" so it's testable
// without waiting for the actual tick, mirroring Scheduled Reports' own
// Run Now action.
followupsRouter.post(
  "/automation/run-now",
  requireAuth,
  requireRole(...CAN_MANAGE_AUTOMATION),
  asyncHandler(automation.runNow),
);
