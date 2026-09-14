import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { list, listAuditQuerySchema } from "./audit";

export const auditRouter = Router();

auditRouter.get("/", requireAuth, validate(listAuditQuerySchema, "query"), asyncHandler(list));
