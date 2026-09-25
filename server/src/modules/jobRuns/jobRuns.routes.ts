import { ADMIN_ROLES } from "@outcomelink/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as jobRuns from "./jobRuns";

export const jobRunsRouter = Router();

jobRunsRouter.get(
  "/",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  validate(jobRuns.listJobRunsQuerySchema, "query"),
  asyncHandler(jobRuns.list),
);
jobRunsRouter.post("/:id/retry", requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(jobRuns.retry));
