import type { NextFunction, Request, Response } from "express";
import type { Role } from "@outcomelink/shared";
import { ApiError } from "../lib/apiError";
import { asyncHandler } from "../lib/asyncHandler";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { getRequestContext } from "../lib/requestContext";

/** Verifies the Bearer access token, attaches req.user, and records the acting user for audit logging. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing bearer token");
  }

  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.user = payload;

    const ctx = getRequestContext();
    if (ctx) ctx.userId = payload.sub;

    next();
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role))
      throw ApiError.forbidden("Insufficient role for this action");
    next();
  };
}

const INSTITUTION_WIDE_ROLES: Role[] = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

/** Program-scoped roles must hold explicit UserProgramAccess for the program in the route params. */
export function requireProgramAccess(paramName = "programId") {
  return asyncHandler<Record<string, string>>(async (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (INSTITUTION_WIDE_ROLES.includes(req.user.role)) return next();

    const programId = Number(req.params[paramName]);
    if (!Number.isInteger(programId)) throw ApiError.badRequest(`Invalid ${paramName}`);

    const access = await prisma.userProgramAccess.findUnique({
      where: { userId_programId: { userId: req.user.sub, programId } },
    });
    if (!access) throw ApiError.forbidden("No access to this program");
    next();
  });
}

/** Campus-scoped roles must hold explicit UserCampusAccess for the campus in the route params. */
export function requireCampusAccess(paramName = "campusId") {
  return asyncHandler<Record<string, string>>(async (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (INSTITUTION_WIDE_ROLES.includes(req.user.role)) return next();

    const campusId = Number(req.params[paramName]);
    if (!Number.isInteger(campusId)) throw ApiError.badRequest(`Invalid ${paramName}`);

    const access = await prisma.userCampusAccess.findUnique({
      where: { userId_campusId: { userId: req.user.sub, campusId } },
    });
    if (!access) throw ApiError.forbidden("No access to this campus");
    next();
  });
}
