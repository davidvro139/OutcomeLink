import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { exportCustomReport, runCustomReport, runReportSchema } from "./customReportBuilder";
import * as reports from "./reports";
import { geographicPlacements } from "./geographicPlacements";
<<<<<<< HEAD
=======
import * as reportExportJobs from "./reportExportJobs";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import * as savedReports from "./savedReports";

export const reportsRouter = Router();

reportsRouter.get(
  "/geographic-placements",
  requireAuth,
  validate(reports.reportingPeriodQuerySchema, "query"),
  asyncHandler(geographicPlacements),
);

reportsRouter.post(
  "/custom/run",
  requireAuth,
  validate(runReportSchema),
  asyncHandler(runCustomReport),
);
reportsRouter.post(
  "/custom/export",
  requireAuth,
  validate(runReportSchema),
  asyncHandler(exportCustomReport),
);
<<<<<<< HEAD
=======
reportsRouter.post(
  "/custom/export-jobs",
  requireAuth,
  validate(runReportSchema),
  asyncHandler(reportExportJobs.queueExport),
);
reportsRouter.get("/custom/export-jobs", requireAuth, asyncHandler(reportExportJobs.list));
reportsRouter.get(
  "/custom/export-jobs/:id/download",
  requireAuth,
  asyncHandler(reportExportJobs.downloadJob),
);

>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
reportsRouter.get("/custom/saved", requireAuth, asyncHandler(savedReports.list));
reportsRouter.post(
  "/custom/saved",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(savedReports.saveReportSchema),
  asyncHandler(savedReports.create),
);
reportsRouter.delete(
  "/custom/saved/:id",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  asyncHandler(savedReports.remove),
);

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
reportsRouter.get("/skills-gap", requireAuth, asyncHandler(reports.skillsGapAnalysis));
