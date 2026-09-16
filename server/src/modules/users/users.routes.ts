import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import * as users from "./users";

export const usersRouter = Router();

usersRouter.get("/", requireAuth, asyncHandler(users.list));
