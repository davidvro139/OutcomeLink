import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { parseDurationToMs } from "../../lib/duration";
import { prisma } from "../../lib/prisma";
import { loginUser, refreshSession, registerUser, type AuthTokens } from "./auth.service";
import type { LoginInput, RegisterInput, UpdatePreferencesInput } from "./auth.schemas";

const REFRESH_COOKIE_NAME = "refreshToken";

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: parseDurationToMs(env.JWT_REFRESH_TTL),
  };
}

function sendTokens(res: Response, tokens: AuthTokens) {
  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, refreshCookieOptions());
  return tokens.accessToken;
}

export async function register(req: Request<unknown, unknown, RegisterInput>, res: Response) {
  const { user, tokens } = await registerUser(req.body);
  const accessToken = sendTokens(res, tokens);
  sendData(res, { user, accessToken }, 201);
}

export async function login(req: Request<unknown, unknown, LoginInput>, res: Response) {
  const { user, tokens } = await loginUser(req.body);
  const accessToken = sendTokens(res, tokens);
  sendData(res, { user, accessToken });
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) throw ApiError.unauthorized("Missing refresh token");

  const tokens = await refreshSession(refreshToken);
  const accessToken = sendTokens(res, tokens);
  sendData(res, { accessToken });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
  sendData(res, { loggedOut: true });
}

/** The signed-in user's own settings — currently just whether notifications are also emailed to them. */
export async function getPreferences(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { emailNotifications: true },
  });
  if (!user) throw ApiError.unauthorized();
  sendData(res, { preferences: user });
}

export async function updatePreferences(req: Request<Record<string, never>, unknown, UpdatePreferencesInput>, res: Response) {
  const user = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { emailNotifications: req.body.emailNotifications },
    select: { emailNotifications: true },
  });
  sendData(res, { preferences: user });
}

export async function me(req: Request, res: Response) {
  // req.user (from the access token) only carries id/role/institutionId — fetch the
  // rest so the response is useful for a profile display, not just token contents.
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, institutionId: true, name: true, email: true, role: true, active: true },
  });
  if (!user) throw ApiError.unauthorized();
  sendData(res, { user });
}
