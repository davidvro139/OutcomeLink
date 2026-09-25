<<<<<<< HEAD
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
=======
import { ADMIN_ROLES } from "@outcomelink/shared";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { createPublicTokenLimiter } from "../../middleware/rateLimit";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import { validate } from "../../middleware/validate";
import * as publicSetPassword from "./publicSetPassword";
import * as users from "./users";

<<<<<<< HEAD
const CAN_MANAGE_USERS = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"] as const;
=======
const CAN_MANAGE_USERS = ADMIN_ROLES;
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

export const usersRouter = Router();

usersRouter.get("/", requireAuth, validate(users.listUsersQuerySchema, "query"), asyncHandler(users.list));
usersRouter.post(
  "/invite",
  requireAuth,
  requireRole(...CAN_MANAGE_USERS),
  validate(users.inviteUserSchema),
  asyncHandler(users.invite),
);
usersRouter.patch(
  "/:id",
  requireAuth,
  requireRole(...CAN_MANAGE_USERS),
  validate(users.updateUserSchema),
  asyncHandler(users.update),
);
usersRouter.patch(
  "/:id/active",
  requireAuth,
  requireRole(...CAN_MANAGE_USERS),
  validate(users.setUserActiveSchema),
  asyncHandler(users.setActive),
);
usersRouter.post(
  "/:id/reset-password",
  requireAuth,
  requireRole(...CAN_MANAGE_USERS),
  asyncHandler(users.resetPassword),
);
usersRouter.put(
  "/:id/access",
  requireAuth,
  requireRole(...CAN_MANAGE_USERS),
  validate(users.setUserAccessSchema),
  asyncHandler(users.setAccess),
);

export const publicUsersRouter = Router();
<<<<<<< HEAD
=======
publicUsersRouter.use(createPublicTokenLimiter());
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

publicUsersRouter.get("/:token", asyncHandler(publicSetPassword.getSetPasswordInfo));
publicUsersRouter.post(
  "/:token",
  validate(publicSetPassword.completeSetPasswordSchema),
  asyncHandler(publicSetPassword.completeSetPassword),
);
