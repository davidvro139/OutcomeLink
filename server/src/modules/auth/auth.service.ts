import { ApiError } from "../../lib/apiError";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import type { LoginInput, RegisterInput } from "./auth.schemas";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: number;
  institutionId: number;
  name: string;
  email: string;
  role: import("@outcomelink/shared").Role;
}

function toAuthenticatedUser(user: {
  id: number;
  institutionId: number;
  name: string;
  email: string;
  role: import("@outcomelink/shared").Role;
}): AuthenticatedUser {
  return {
    id: user.id,
    institutionId: user.institutionId,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function issueTokens(user: AuthenticatedUser): AuthTokens {
  return {
    accessToken: signAccessToken({
      sub: user.id,
      role: user.role,
      institutionId: user.institutionId,
    }),
    refreshToken: signRefreshToken({ sub: user.id }),
  };
}

/**
 * Open self-registration is a bootstrap convenience for a project with no user-management
 * screens yet (spec §4's admin-managed user model comes in a later stage — see
 * docs/TODO.md stage 2 follow-ups). This should be locked down once that exists.
 */
export async function registerUser(
  input: RegisterInput,
): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict("An account with this email already exists");

  const institution = await prisma.institution.findUnique({ where: { id: input.institutionId } });
  if (!institution) throw ApiError.badRequest("Unknown institutionId");

  const passwordHash = await hashPassword(input.password);
  const created = await prisma.user.create({
    data: {
      institutionId: input.institutionId,
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    },
  });

  const user = toAuthenticatedUser(created);
  return { user, tokens: issueTokens(user) };
}

export async function loginUser(
  input: LoginInput,
): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
  const found = await prisma.user.findUnique({ where: { email: input.email } });
  if (!found || !found.active) throw ApiError.unauthorized("Invalid email or password");

  const passwordMatches = await verifyPassword(input.password, found.passwordHash);
  if (!passwordMatches) throw ApiError.unauthorized("Invalid email or password");

  await prisma.user.update({ where: { id: found.id }, data: { lastLoginAt: new Date() } });

  const user = toAuthenticatedUser(found);
  return { user, tokens: issueTokens(user) };
}

export async function refreshSession(refreshToken: string): Promise<AuthTokens> {
  let payload: { sub: number };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const found = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!found || !found.active) throw ApiError.unauthorized("Invalid or expired refresh token");

  return issueTokens(toAuthenticatedUser(found));
}
