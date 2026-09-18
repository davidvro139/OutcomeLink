import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { generateDigestSchema, generateMissingOutcomesDigest } from "./missingOutcomesDigest";
import * as notifications from "./notifications";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, asyncHandler(notifications.list));
notificationsRouter.patch("/read-all", requireAuth, asyncHandler(notifications.markAllRead));
notificationsRouter.patch("/:id/read", requireAuth, asyncHandler(notifications.markRead));

notificationsRouter.post(
  "/missing-outcomes-digest",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(generateDigestSchema),
  asyncHandler(generateMissingOutcomesDigest),
);
