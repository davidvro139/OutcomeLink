import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { getPreferences, login, logout, me, refresh, register, updatePreferences } from "./auth.controller";
import { loginSchema, registerSchema, updatePreferencesSchema } from "./auth.schemas";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), asyncHandler(register));
authRouter.post("/login", validate(loginSchema), asyncHandler(login));
authRouter.post("/refresh", asyncHandler(refresh));
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, asyncHandler(me));
authRouter.get("/me/preferences", requireAuth, asyncHandler(getPreferences));
authRouter.patch("/me/preferences", requireAuth, validate(updatePreferencesSchema), asyncHandler(updatePreferences));
