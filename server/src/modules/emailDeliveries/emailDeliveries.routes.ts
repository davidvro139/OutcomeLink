import { ADMIN_ROLES } from "@outcomelink/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as emailDeliveries from "./emailDeliveries";

export const emailDeliveriesRouter = Router();

emailDeliveriesRouter.get(
  "/",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  validate(emailDeliveries.listEmailDeliveriesQuerySchema, "query"),
  asyncHandler(emailDeliveries.list),
);
// Any signed-in user may ask — it only says whether email is on, and the client uses it to word its own toasts.
emailDeliveriesRouter.get("/status", requireAuth, asyncHandler(emailDeliveries.status));
