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
 * Public self-registration bootstraps a BRAND NEW institution and its first
 * user — always as SYSTEM_ADMINISTRATOR of that new institution, never a
 * caller-chosen role, and never joining an institution that already exists.
 *
 * This used to accept an arbitrary institutionId and role with no
 * authentication at all — a real cross-tenant privilege-escalation hole
 * (project review, 2026-09-18: "the unauthenticated route accepts an
 * existing institution ID and any role, including SYSTEM_ADMINISTRATOR").
 * Restricting it to "create your own institution" closes that off entirely
 * (there's no existing institution to escalate into) while still leaving a
 * genuine, common self-service path for a brand-new customer to sign up.
 * Adding a user to an institution that already has one now requires an
 * existing admin of that institution — see users.ts's createUser().
 */
export async function registerUser(
  input: RegisterInput,
): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict("An account with this email already exists");

  const passwordHash = await hashPassword(input.password);
  const created = await prisma.$transaction(async (tx) => {
    const institution = await tx.institution.create({ data: { name: input.institutionName } });
    return tx.user.create({
      data: {
        institutionId: institution.id,
        name: input.name,
        email: input.email,
        passwordHash,
        role: "SYSTEM_ADMINISTRATOR",
      },
    });
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
