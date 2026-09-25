import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { createPublicTokenLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import * as system from "./system";

export const systemRouter = Router();

// Called by the operator's backup job, not by a signed-in user (see requireBackupToken).
systemRouter.post(
  "/backup-checkin",
  createPublicTokenLimiter(),
  system.requireBackupToken,
  validate(system.backupCheckinSchema),
  asyncHandler(system.backupCheckin),
);
