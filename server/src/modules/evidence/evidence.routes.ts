import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as evidence from "./evidence";

export const evidenceRouter = Router();

evidenceRouter.get("/", requireAuth, asyncHandler(evidence.list));
evidenceRouter.get("/:id/file", requireAuth, asyncHandler(evidence.download));
evidenceRouter.post(
  "/",
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  evidence.uploadMiddleware,
  validate(evidence.createEvidenceSchema),
  asyncHandler(evidence.create),
);
