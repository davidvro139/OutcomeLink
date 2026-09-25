import { ADMIN_ROLES } from "@outcomelink/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as closeout from "./closeout";
import * as frameworks from "./frameworks/frameworks";
import * as improvementPlans from "./improvementPlans";
import * as readiness from "./readiness";
import * as reportingPeriods from "./reportingPeriods";
import * as results from "./results";
import * as trends from "./trends";
import * as ruleSets from "./rules/ruleSets";
import * as validation from "./validation";

const SYSTEM_ADMIN = "SYSTEM_ADMINISTRATOR" as const;
const CAN_FINALIZE = ADMIN_ROLES;

export const accreditationRouter = Router();

accreditationRouter.get("/frameworks", requireAuth, asyncHandler(frameworks.list));
accreditationRouter.post(
  "/frameworks",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  validate(frameworks.createFrameworkSchema),
  asyncHandler(frameworks.create),
);

accreditationRouter.get(
  "/frameworks/:frameworkId/rule-sets",
  requireAuth,
  asyncHandler(ruleSets.list),
);
accreditationRouter.post(
  "/frameworks/:frameworkId/rule-sets",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  validate(ruleSets.createRuleSetSchema),
  asyncHandler(ruleSets.create),
);

accreditationRouter.get(
  "/trends",
  requireAuth,
  validate(trends.trendsQuerySchema, "query"),
  asyncHandler(trends.trends),
);

accreditationRouter.get("/reporting-periods", requireAuth, asyncHandler(reportingPeriods.list));
accreditationRouter.get("/reporting-periods/:id", requireAuth, asyncHandler(reportingPeriods.show));
accreditationRouter.post(
  "/reporting-periods",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  validate(reportingPeriods.createReportingPeriodSchema),
  asyncHandler(reportingPeriods.create),
);
accreditationRouter.patch(
  "/reporting-periods/:id",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  validate(reportingPeriods.updateReportingPeriodSchema),
  asyncHandler(reportingPeriods.update),
);

accreditationRouter.get("/reporting-periods/:id/closeout", requireAuth, asyncHandler(closeout.show));
accreditationRouter.post(
  "/reporting-periods/:id/closeout/sign-off",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  validate(closeout.signOffSchema),
  asyncHandler(closeout.signOff),
);
accreditationRouter.post(
  "/reporting-periods/:id/finalize",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  validate(reportingPeriods.finalizeReportingPeriodSchema),
  asyncHandler(reportingPeriods.finalize),
);
accreditationRouter.post(
  "/reporting-periods/:id/submit",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  asyncHandler(reportingPeriods.submit),
);
accreditationRouter.post(
  "/reporting-periods/:id/reopen",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  validate(reportingPeriods.reopenReportingPeriodSchema),
  asyncHandler(reportingPeriods.reopen),
);

accreditationRouter.post(
  "/reporting-periods/:id/compute",
  requireAuth,
  requireRole(SYSTEM_ADMIN, "INSTITUTIONAL_ADMINISTRATOR"),
  asyncHandler(results.compute),
);
accreditationRouter.get(
  "/reporting-periods/:id/results",
  requireAuth,
  validate(results.listResultsQuerySchema, "query"),
  asyncHandler(results.listResults),
);
accreditationRouter.get(
  "/reporting-periods/:id/results/export",
  requireAuth,
  asyncHandler(results.exportResults),
);
accreditationRouter.get(
  "/reporting-periods/:id/drill-down",
  requireAuth,
  validate(results.drillDownQuerySchema, "query"),
  asyncHandler(results.drillDown),
);
accreditationRouter.get(
  "/reporting-periods/:id/enrollments/:enrollmentId/explanation",
  requireAuth,
  asyncHandler(results.studentExplanation),
);
accreditationRouter.get(
  "/reporting-periods/:id/readiness",
  requireAuth,
  asyncHandler(readiness.readiness),
);

accreditationRouter.post(
  "/reporting-periods/:id/validate",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  asyncHandler(validation.validate),
);
accreditationRouter.get(
  "/reporting-periods/:id/validation-issues",
  requireAuth,
  validate(validation.listIssuesQuerySchema, "query"),
  asyncHandler(validation.listIssues),
);
accreditationRouter.get(
  "/reporting-periods/:id/validation-issues/export",
  requireAuth,
  validate(validation.listIssuesQuerySchema, "query"),
  asyncHandler(validation.exportIssues),
);
accreditationRouter.patch(
  "/reporting-periods/:id/validation-issues/:issueId/resolve",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  asyncHandler(validation.resolveIssue),
);
accreditationRouter.patch(
  "/reporting-periods/:id/validation-issues/bulk-resolve",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  validate(validation.bulkResolveIssuesSchema),
  asyncHandler(validation.bulkResolveIssues),
);

accreditationRouter.get(
  "/improvement-plans",
  requireAuth,
  validate(improvementPlans.listImprovementPlansQuerySchema, "query"),
  asyncHandler(improvementPlans.list),
);
accreditationRouter.post(
  "/improvement-plans",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(improvementPlans.createImprovementPlanSchema),
  asyncHandler(improvementPlans.create),
);
accreditationRouter.get(
  "/improvement-plans/:id",
  requireAuth,
  asyncHandler(improvementPlans.show),
);
accreditationRouter.patch(
  "/improvement-plans/:id",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(improvementPlans.updateImprovementPlanSchema),
  asyncHandler(improvementPlans.update),
);
accreditationRouter.post(
  "/improvement-plans/:id/updates",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(improvementPlans.createImprovementPlanUpdateSchema),
  asyncHandler(improvementPlans.addUpdate),
);
