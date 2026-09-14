import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { search, searchQuerySchema } from "./search";

export const searchRouter = Router();

searchRouter.get("/", requireAuth, validate(searchQuerySchema, "query"), asyncHandler(search));
