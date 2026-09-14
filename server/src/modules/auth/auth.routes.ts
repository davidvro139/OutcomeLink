import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { login, logout, me, refresh, register } from "./auth.controller";
import { loginSchema, registerSchema } from "./auth.schemas";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), asyncHandler(register));
authRouter.post("/login", validate(loginSchema), asyncHandler(login));
authRouter.post("/refresh", asyncHandler(refresh));
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, asyncHandler(me));
