import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as employerSurveys from "./employerSurveys";
import * as graduateCampaign from "./graduateCampaign";
import * as graduateSurveys from "./graduateSurveys";
import * as publicSurveys from "./publicSurveys";

export const surveysRouter = Router();

surveysRouter.get("/students/:studentId/graduate-surveys", requireAuth, asyncHandler(graduateSurveys.list));
surveysRouter.post(
  "/students/:studentId/graduate-surveys",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(graduateSurveys.createGraduateSurveySchema),
  asyncHandler(graduateSurveys.create),
);

surveysRouter.post(
  "/surveys/graduate-campaign",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(graduateCampaign.startGraduateCampaignSchema),
  asyncHandler(graduateCampaign.startCampaign),
);

surveysRouter.get("/students/:studentId/employer-surveys", requireAuth, asyncHandler(employerSurveys.list));
surveysRouter.post(
  "/students/:studentId/employer-surveys",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(employerSurveys.createEmployerSurveySchema),
  asyncHandler(employerSurveys.create),
);

export const publicSurveysRouter = Router();

publicSurveysRouter.get("/graduate/:token", asyncHandler(publicSurveys.getGraduateSurvey));
publicSurveysRouter.post(
  "/graduate/:token/response",
  validate(publicSurveys.graduateSurveyResponseSchema),
  asyncHandler(publicSurveys.submitGraduateSurveyResponse),
);

publicSurveysRouter.get("/employer/:token", asyncHandler(publicSurveys.getEmployerSurvey));
publicSurveysRouter.post(
  "/employer/:token/response",
  validate(publicSurveys.employerSurveyResponseSchema),
  asyncHandler(publicSurveys.submitEmployerSurveyResponse),
);
