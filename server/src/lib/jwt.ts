import jwt, { type SignOptions } from "jsonwebtoken";
import type { Role } from "@outcomelink/shared";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: number;
  role: Role;
  institutionId: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  // We fully control what goes into this token at sign time, so the standard
  // library's generic string/JwtPayload return type doesn't reflect our shape.
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessTokenPayload;
}

export interface RefreshTokenPayload {
  sub: number;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as RefreshTokenPayload;
}
