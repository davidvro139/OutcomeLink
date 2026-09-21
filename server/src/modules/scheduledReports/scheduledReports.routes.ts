import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as scheduledReports from "./scheduledReports";

export const scheduledReportsRouter = Router();

scheduledReportsRouter.get("/", requireAuth, asyncHandler(scheduledReports.list));
scheduledReportsRouter.post(
  "/",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(scheduledReports.createScheduledReportSubscriptionSchema),
  asyncHandler(scheduledReports.create),
);
scheduledReportsRouter.patch(
  "/:id",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(scheduledReports.updateScheduledReportSubscriptionSchema),
  asyncHandler(scheduledReports.update),
);
scheduledReportsRouter.delete(
  "/:id",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  asyncHandler(scheduledReports.remove),
);
scheduledReportsRouter.post(
  "/:id/run-now",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  asyncHandler(scheduledReports.runNow),
);
scheduledReportsRouter.get("/:id/runs", requireAuth, asyncHandler(scheduledReports.listRuns));
scheduledReportsRouter.get(
  "/runs/:runId/download",
  requireAuth,
  asyncHandler(scheduledReports.downloadRun),
);
