import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as users from "./users";

const CAN_MANAGE_USERS = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"] as const;

export const usersRouter = Router();

usersRouter.get("/", requireAuth, asyncHandler(users.list));
usersRouter.post(
  "/",
  requireAuth,
  requireRole(...CAN_MANAGE_USERS),
  validate(users.createUserSchema),
  asyncHandler(users.create),
);
