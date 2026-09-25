import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as handlers from "./handlers";

export const equityRouter = Router();

equityRouter.get(
  "/breakdown",
  requireAuth,
  validate(handlers.breakdownQuerySchema, "query"),
  asyncHandler(handlers.show),
);
