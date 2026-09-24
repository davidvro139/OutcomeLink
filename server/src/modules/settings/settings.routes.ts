import { ADMIN_ROLES } from "@outcomelink/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as settings from "./settings";

export const settingsRouter = Router();

const ADMINS = requireRole(...ADMIN_ROLES);
// Editing SMTP settings makes the server open connections to a host an administrator names, so it is
// limited to the highest role; institutional administrators can see the settings but not change them.
const SYSTEM_ADMIN = requireRole("SYSTEM_ADMINISTRATOR");

settingsRouter.get("/email", requireAuth, ADMINS, asyncHandler(settings.getEmail));
settingsRouter.put(
  "/email",
  requireAuth,
  SYSTEM_ADMIN,
  validate(settings.updateEmailSettingsSchema),
  asyncHandler(settings.updateEmail),
);
settingsRouter.delete("/email", requireAuth, SYSTEM_ADMIN, asyncHandler(settings.resetEmail));
settingsRouter.post("/email/test", requireAuth, SYSTEM_ADMIN, asyncHandler(settings.testEmail));

settingsRouter.get("/retention", requireAuth, ADMINS, asyncHandler(settings.getRetention));
settingsRouter.put(
  "/retention",
  requireAuth,
  ADMINS,
  validate(settings.updateRetentionSchema),
  asyncHandler(settings.updateRetention),
);
settingsRouter.post("/retention/run", requireAuth, ADMINS, asyncHandler(settings.runRetentionNow));

settingsRouter.get("/backup-status", requireAuth, ADMINS, asyncHandler(settings.getBackup));
