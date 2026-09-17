import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as reports from "./reports";

export const reportsRouter = Router();

reportsRouter.get(
  "/time-to-employment",
  requireAuth,
  validate(reports.reportingPeriodQuerySchema, "query"),
  asyncHandler(reports.timeToEmployment),
);
reportsRouter.get(
  "/placement-quality",
  requireAuth,
  validate(reports.reportingPeriodQuerySchema, "query"),
  asyncHandler(reports.placementQuality),
);
reportsRouter.get(
  "/outcome-funnel",
  requireAuth,
  validate(reports.reportingPeriodQuerySchema, "query"),
  asyncHandler(reports.outcomeFunnel),
);
reportsRouter.get(
  "/unknown-outcomes",
  requireAuth,
  validate(reports.reportingPeriodQuerySchema, "query"),
  asyncHandler(reports.unknownOutcomes),
);
reportsRouter.get("/follow-up-effectiveness", requireAuth, asyncHandler(reports.followUpEffectiveness));
