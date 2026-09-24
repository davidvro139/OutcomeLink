import { ADMIN_ROLES } from "@outcomelink/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import "./atRiskJob"; // registers the daily at-risk check with the job runner
import * as handlers from "./handlers";

export const programDashboardRouter = Router();

// Read-only and scoped to the caller's accessible programs, so any signed-in role may look.
programDashboardRouter.get(
  "/programs",
  requireAuth,
  validate(handlers.dashboardQuerySchema, "query"),
  asyncHandler(handlers.show),
);
programDashboardRouter.get(
  "/programs/export",
  requireAuth,
  validate(handlers.dashboardQuerySchema, "query"),
  asyncHandler(handlers.exportDashboard),
);
// Refreshing the stored results writes them (institution-wide), so it needs a role that can act on the data.
programDashboardRouter.post(
  "/programs/recompute",
  requireAuth,
  requireRole("PROGRAM_ADMINISTRATOR", ...ADMIN_ROLES),
  validate(handlers.dashboardQuerySchema, "query"),
  asyncHandler(handlers.recompute),
);
