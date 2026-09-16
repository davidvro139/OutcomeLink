import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as frameworks from "./frameworks/frameworks";
import * as readiness from "./readiness";
import * as reportingPeriods from "./reportingPeriods";
import * as results from "./results";
import * as ruleSets from "./rules/ruleSets";
import * as validation from "./validation";

const SYSTEM_ADMIN = "SYSTEM_ADMINISTRATOR" as const;
const CAN_FINALIZE = [SYSTEM_ADMIN, "INSTITUTIONAL_ADMINISTRATOR"] as const;

export const accreditationRouter = Router();

accreditationRouter.get("/frameworks", requireAuth, asyncHandler(frameworks.list));
accreditationRouter.post(
  "/frameworks",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
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
  requireRole(SYSTEM_ADMIN),
  validate(ruleSets.createRuleSetSchema),
  asyncHandler(ruleSets.create),
);

accreditationRouter.get("/reporting-periods", requireAuth, asyncHandler(reportingPeriods.list));
accreditationRouter.get("/reporting-periods/:id", requireAuth, asyncHandler(reportingPeriods.show));
accreditationRouter.post(
  "/reporting-periods",
  requireAuth,
  requireRole(SYSTEM_ADMIN),
  validate(reportingPeriods.createReportingPeriodSchema),
  asyncHandler(reportingPeriods.create),
);

accreditationRouter.post(
  "/reporting-periods/:id/finalize",
  requireAuth,
  requireRole(...CAN_FINALIZE),
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
accreditationRouter.patch(
  "/reporting-periods/:id/validation-issues/:issueId/resolve",
  requireAuth,
  requireRole(...CAN_FINALIZE),
  asyncHandler(validation.resolveIssue),
);
